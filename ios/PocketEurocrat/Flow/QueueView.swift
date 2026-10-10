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
        }
    }

    /// Eased so it crawls at first and then plunges — it never feels like a real queue.
    private func position(_ t: QueueTicket, now: Date) -> Int {
        if let skip = flow.skipResult { return skipped ? skip.position : t.position }
        let p = min(max(now.timeIntervalSince(started) / max(t.countdownSec, 1), 0), 1)
        // Short (5–10 s demo) countdowns need a gentle curve or the number is gone in the first second.
        return Int(Double(t.position) * pow(1 - p, t.countdownSec <= 10 ? 1.15 : 2.4))
    }

    private func content(_ t: QueueTicket, position: Int, now: Date) -> some View {
        VStack(spacing: 18) {
            // No case stream yet in the queue: the same deterministic race the server will report, from registration.
            MeanwhileStrip(meanwhile: .estimate(key: t.applicantId,
                                                elapsedSec: now.timeIntervalSince(flow.registeredAt ?? started)))
                .padding(.top, 8)
            Spacer()
            Text("Application #\(t.ticket)").font(.footnote.monospaced()).foregroundStyle(.secondary)
            Text("Your position in the queue").font(.headline)
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
                .padding(.top, 8)
            }
            Spacer()
        }
        .padding(.horizontal, 24)
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
