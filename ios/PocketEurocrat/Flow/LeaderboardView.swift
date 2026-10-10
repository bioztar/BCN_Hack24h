import Observation
import SwiftUI

@MainActor
@Observable
final class LeaderboardModel {
    var entries: [LeaderboardEntry] = []
    var sort: LeaderboardSort = .fines { didSet { if oldValue != sort { entries = Self.sorted(entries, by: sort); Task { await load() } } } }
    var errorMessage: String?
    var selected: LeaderboardEntry?

    let backend: RoastBackend
    @ObservationIgnored private var listening = false

    init(backend: RoastBackend) { self.backend = backend }

    func load() async {
        do {
            entries = Self.sorted(try await backend.leaderboard(sort: sort, limit: 50), by: sort)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Live updates: each new verdict is merged in; reconnects with a pause if the stream drops.
    func listen() async {
        guard !listening else { return }
        listening = true
        defer { listening = false }
        while !Task.isCancelled {
            do {
                for try await entry in backend.leaderboardStream() { merge(entry) }
            } catch {
                if Task.isCancelled { return }
            }
            try? await Task.sleep(for: .seconds(3))
        }
    }

    private func merge(_ entry: LeaderboardEntry) {
        var next = entries.filter { $0.caseId != entry.caseId }
        next.append(entry)
        entries = Array(Self.sorted(next, by: sort).prefix(100))
    }

    static func sorted(_ list: [LeaderboardEntry], by sort: LeaderboardSort) -> [LeaderboardEntry] {
        switch sort {
        case .fines: list.sorted { $0.totalEur > $1.totalEur }
        case .jail: list.sorted { $0.totalJailMonths > $1.totalJailMonths }
        case .recent: list.sorted { $0.issuedAt > $1.issuedAt }
        }
    }
}

struct LeaderboardView: View {
    @Bindable var model: LeaderboardModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Sort", selection: $model.sort) {
                    ForEach(LeaderboardSort.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16).padding(.vertical, 8)

                if model.entries.isEmpty {
                    ContentUnavailableView("No verdicts yet", systemImage: "list.number",
                                           description: Text(model.errorMessage ?? "Be the first to be refused."))
                } else {
                    List(Array(model.entries.enumerated()), id: \.element.id) { index, entry in
                        Button { model.selected = entry } label: { row(index + 1, entry) }
                            .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Hall of Shame")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await model.load() }
        .task { await model.listen() }
        .sheet(item: $model.selected) { entry in LeaderboardDetailView(entry: entry, backend: model.backend) }
    }

    private func row(_ rank: Int, _ e: LeaderboardEntry) -> some View {
        HStack(spacing: 12) {
            Text("\(rank)").font(.title3.monospacedDigit().weight(.bold)).frame(width: 30)
                .foregroundStyle(rank <= 3 ? .orange : .secondary)
            AvatarView(url: e.photoUrl.flatMap(model.backend.resolve), fallback: e.startupName)
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(e.startupName).font(.headline).lineLimit(1)
                    if e.meltdown { Text("🔥") }
                }
                Text([e.founderName, e.oneLiner].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if !e.topLaws.isEmpty {
                    Text(e.topLaws.joined(separator: " · ")).font(.caption2.monospaced()).foregroundStyle(.orange)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.short(e.totalEur)).font(.headline.monospacedDigit()).foregroundStyle(.red)
                if e.totalJailMonths > 0 { Text("⛓ \(Money.jail(e.totalJailMonths))").font(.caption2) }
            }
        }
        .padding(.vertical, 4)
    }
}

struct AvatarView: View {
    let url: URL?
    let fallback: String

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { placeholder }
                }
            } else {
                placeholder
            }
        }
        .clipShape(Circle())
    }

    private var placeholder: some View {
        ZStack {
            Circle().fill(.thinMaterial)
            Text(String(fallback.prefix(1)).uppercased()).font(.headline)
        }
    }
}

struct LeaderboardDetailView: View {
    let entry: LeaderboardEntry
    let backend: RoastBackend
    @State private var findings: [Notice.Finding] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    AvatarView(url: entry.photoUrl.flatMap(backend.resolve), fallback: entry.startupName).frame(width: 72, height: 72)
                    VStack(alignment: .leading) {
                        Text(entry.startupName + (entry.meltdown ? " 🔥" : "")).font(.title2.weight(.bold))
                        if let f = entry.founderName { Text(f).foregroundStyle(.secondary) }
                    }
                }
                if let one = entry.oneLiner { Text("“\(one)”").italic() }
                HStack {
                    stat("Fines", Money.short(entry.totalEur), .red)
                    stat("Jail", entry.totalJailMonths > 0 ? Money.jail(entry.totalJailMonths) : "—", .orange)
                }
                if !entry.topLaws.isEmpty {
                    Text(entry.topLaws.joined(separator: " · ")).font(.footnote.monospaced()).foregroundStyle(.orange)
                }
                if !findings.isEmpty {
                    Text("Findings").font(.headline).padding(.top, 6)
                    ForEach(Array(findings.enumerated()), id: \.offset) { _, f in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.text).font(.callout)
                            Text(f.provision.label).font(.caption2.monospaced()).foregroundStyle(.orange)
                        }
                    }
                }
                Button("Close") { dismiss() }.frame(maxWidth: .infinity).padding(.top, 10)
            }
            .padding(20)
        }
        .task {
            if let d = try? await backend.leaderboardDetail(caseID: entry.caseId) { findings = d.findings }
        }
        .presentationDetents([.medium, .large])
    }

    private func stat(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.monospacedDigit().weight(.bold)).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity).padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
