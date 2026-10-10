import SwiftUI

/// The queue: a giant position counting down to 0 over `countdownSec`, an absurd ETA, and the
/// "better place" skip. Reaching 0 (or skipping) moves on to duo select.
struct QueueView: View {
    @Bindable var flow: FlowModel
    @State private var started = Date()
    @State private var showCauses = false
    @State private var skipped = false

    var body: some View {
        if let ticket = flow.ticket {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
                content(ticket, position: position(ticket, now: timeline.date), now: timeline.date)
            }
            .onAppear { started = Date() }
            .sheet(isPresented: $showCauses) { causeSheet }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)   // never an empty tab
        }
    }

    /// The queue is one Whack-a-Model round: 30 s whatever the ticket says (the game's own round may end it sooner).
    private static let queueSeconds: Double = 30

    /// Eased so it crawls at first and then plunges — it never feels like a real queue.
    private func position(_ t: QueueTicket, now: Date) -> Int {
        if let skip = flow.skipResult { return skipped ? skip.position : t.position }
        let p = min(max(now.timeIntervalSince(started) / Self.queueSeconds, 0), 1)
        return Int(Double(t.position) * pow(1 - p, 1.6))
    }

    private func content(_ t: QueueTicket, position: Int, now: Date) -> some View {
        VStack(spacing: 10) {
            Text("Application #\(t.ticket) — to be reviewed").font(.footnote.monospaced()).foregroundStyle(.secondary)
                .padding(.top, 8)
            Text(position.formatted(.number.grouping(.automatic)))
                .font(.system(size: 52, weight: .black, design: .monospaced))
                .minimumScaleFactor(0.5).lineLimit(1)
                .contentTransition(.numericText())
                .foregroundStyle(position <= 1 ? .green : .primary)
            Text(t.etaText).font(.callout).foregroundStyle(.orange)

            if let skip = flow.skipResult {
                VStack(spacing: 8) {
                    Text("\(skip.cause.emoji) \(skip.cause.label)").font(.title3.weight(.bold))
                    Text(skip.quip).font(.callout).multilineTextAlignment(.center)
                    Text("You skipped \(skip.skipped.formatted()) applicants.").font(.footnote).foregroundStyle(.secondary)
                }
                .padding()
                .background(.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
                .transition(.scale.combined(with: .opacity))
                .task {
                    skipped = true
                    try? await Task.sleep(for: .seconds(2.6))
                    flow.queueFinished()
                }
            } else {
                Button {
                    showCauses = true
                } label: {
                    Text("But we're making the world a better place")
                        .fontWeight(.semibold).multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(.pink)
                .controlSize(.large)
            }
            if flow.skipResult == nil {
                // The queue IS the game: stamp every non-EU model while the file waits. Its round (or 30 s) ends the queue.
                ArcadeWebView(url: Arcade.whackURL(base: BackendFactory.baseURL()), base: BackendFactory.baseURL(),
                              onLoaded: {}, onFailed: {},
                              onScore: { s in
                                  guard s.game == "whack" else { return }
                                  flow.pocket.whack.banned = s.hits
                                  flow.pocket.whack.mistral = s.mistralHits
                                  flow.pocket.whack.played = true
                                  Task {
                                      try? await Task.sleep(for: .seconds(2.5))
                                      flow.queueFinished()
                                  }
                              },
                              onLeave: {},
                              playerName: flow.startupName)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.bottom, 70)   // clear of the floating tab bar
            } else {
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .onChange(of: position <= 0) { _, done in if done { flow.queueFinished() } }
    }

    private var causeSheet: some View {
        VStack(spacing: 16) {
            Text("What's your cause?").font(.title3.weight(.bold)).padding(.top, 20)
            Text("The Commission is deeply moved. Pick one.").font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(BetterPlaceCause.allCases) { cause in
                    Button {
                        showCauses = false
                        Task { await flow.skipQueue(cause: cause) }
                    } label: {
                        VStack(spacing: 4) {
                            Text(cause.emoji).font(.largeTitle)
                            Text(cause.label).font(.subheadline.weight(.semibold))
                            Text(cause.desc).font(.caption2).foregroundStyle(.secondary)
                                .multilineTextAlignment(.center).padding(.horizontal, 6)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            Spacer()
        }
        .presentationDetents([.large])
    }
}
