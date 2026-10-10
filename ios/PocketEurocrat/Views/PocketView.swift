import SpriteKit
import SwiftUI

struct PocketView: View {
    @Bindable var model: PocketModel
    var onApplyAgain: () -> Void = {}
    @State private var pitch = ""
    @FocusState private var typing: Bool

    var body: some View {
        ZStack {
            // The scene fills the whole screen and ignores the keyboard: it never resizes or shifts.
            SpriteView(scene: model.puppet, preferredFramesPerSecond: 60)
                .ignoresSafeArea(.all)
                .onTapGesture { typing = false; model.wake() }

            // Only this overlay rides up with the keyboard.
            VStack(spacing: 0) {
                meter
                Spacer()
                if let line = model.subtitle, !model.skipping { SubtitleBar(line: line, tier: model.tierName) }
                if model.phase == .roasting, model.notice == nil {
                    if model.skipping {
                        HStack(spacing: 8) { ProgressView(); Text("Stamping your verdict…").font(.subheadline.weight(.semibold)) }
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.bottom, 8)
                    } else {
                        Button { model.skipToVerdict() } label: {
                            Label("Skip to verdict", systemImage: "forward.end.fill").font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                .background(Capsule().fill(.ultraThinMaterial))
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, 8)
                    }
                }
                controls
            }

            if model.isAsleep { Text("💤").font(.system(size: 72)).transition(.opacity) }
            if let stamp = model.stamp { StampView(text: stamp) }
        }
        .animation(.easeInOut(duration: 0.25), value: model.isAsleep)
        .task {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-focus-input") {   // screenshot aid (tools/sim-shot.sh)
                try? await Task.sleep(for: .seconds(1.5))
                typing = true
            }
            if ProcessInfo.processInfo.arguments.contains("-skip-demo") {   // taps "Skip to verdict" after 6 s
                try? await Task.sleep(for: .seconds(6))
                model.skipToVerdict()
            }
            if ProcessInfo.processInfo.arguments.contains("-outrage") { model.puppet.setExpression(.outrage) }   // screenshot aid
            if ProcessInfo.processInfo.arguments.contains("-ignite") {   // meltdown screenshot aid
                try? await Task.sleep(for: .seconds(1))
                model.puppet.ignite()
            }
            if ProcessInfo.processInfo.arguments.contains("-mouth-demo") {   // hold both mouths open for a screenshot
                model.puppet.setMouth(open: 0.9, wide: 1, speaker: model.duo.first?.id)   // left officer only
            }
            #endif
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue else { return }
            let height = max(0, UIScreen.main.bounds.height - end.minY)
            model.puppet.frameFace(keyboardHeight: height > 50 ? height + 110 : nil)   // + input bar
        }
        .alert("Hmm.", isPresented: .init(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.errorMessage ?? "") }
        .sheet(item: .init(get: { model.notice.map(NoticeBox.init) }, set: { if $0 == nil { model.dismissVerdict() } })) { box in
            VerdictCard(notice: box.notice, resolve: model.backend.resolve,
                        banned: model.whack.played ? (model.whack.banned, model.whack.mistral) : nil,
                        pitch: model.lastPitch ?? box.notice.startupName ?? box.notice.startup,
                        canAppeal: !model.appealUsed,
                        onAppeal: { text in Task { await model.appeal(text: text) } },
                        onApplyAgain: {
                model.dismissVerdict()
                onApplyAgain()
            })
            .presentationDetents([.large])
        }
    }

    /// Fines / jail meter: spins up on every `fine` event; flames at meltdown. Shows the repo-analysis
    /// progress instead while the officers read a GitHub pitch.
    private var meter: some View {
        VStack(spacing: 4) {
            if let a = model.analyzing {
                VStack(spacing: 6) {
                    Text(a.stage).font(.footnote.weight(.semibold))
                    ProgressView(value: a.progress).tint(.orange)
                }
                .padding(12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
            } else if model.totalEur > 0 || model.lastFine != nil {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(Money.short(model.totalEur))
                        .font(.system(size: 34, weight: .black, design: .rounded).monospacedDigit())
                        .foregroundStyle(model.meltedDown ? .orange : .red)
                        .contentTransition(.numericText(value: model.totalEur))
                    if model.totalJailMonths > 0 {
                        Text("⛓ \(Money.jail(model.totalJailMonths))").font(.headline.monospacedDigit())
                            .contentTransition(.numericText(value: Double(model.totalJailMonths)))
                    }
                    if model.meltedDown { Text("🔥") .font(.title) }
                }
                .animation(.easeOut(duration: 0.6), value: model.totalEur)
                if let f = model.lastFine {
                    Text("\(f.provision.label) — \(f.caption)")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.center)
                        .id(f.id)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            if let m = model.meanwhile { MeanwhileStrip(meanwhile: m).padding(.top, 4) }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12).padding(.top, 6)
        .animation(.easeOut(duration: 0.25), value: model.lastFine?.id)
    }

    private var controls: some View {
        VStack(spacing: 8) {
            if case .awaiting(let prompt) = model.phase {
                Text(prompt).font(.footnote).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                TextField("Pitch your startup…", text: $pitch, axis: .vertical)
                    .focused($typing)
                    .lineLimit(1...3)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit(send)
                Button(action: send) { Image(systemName: "paperplane.fill") }
                    .disabled(pitch.trimmingCharacters(in: .whitespaces).isEmpty || model.phase == .roasting)
                micButton
            }
            #if targetEnvironment(simulator)
            Button("Shake (simulator)") { model.shake() }.font(.caption)
            #endif
        }
        .padding(12)
        .background(.ultraThinMaterial)
    }

    private var micButton: some View {
        let listening = model.phase == .listening
        return Image(systemName: listening ? "waveform" : "mic.fill")
            .font(.title3)
            .frame(width: 44, height: 44)
            .background(Circle().fill(listening ? Color.red : Color.accentColor))
            .foregroundStyle(.white)
            .scaleEffect(listening ? 1.2 : 1)
            .opacity(model.phase == .roasting ? 0.4 : 1)
            .animation(.spring(duration: 0.2), value: listening)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in if model.phase != .listening { Task { await model.beginDictation() } } }
                .onEnded { _ in Task { await model.endDictation() } })
            .accessibilityLabel("Hold to dictate")
    }

    private func send() {
        let text = pitch
        pitch = ""
        typing = false
        Task { await model.submit(text) }
    }
}

private struct NoticeBox: Identifiable {
    let notice: Notice
    var id: String { notice.serial }
}

private struct SubtitleBar: View {
    let line: RoastLine
    let tier: String?

    /// The officer's accent colour, lifted toward white so the dark ones (navy, forest) read on black.
    private var accent: Color {
        guard let p = Roster.officers.first(where: { $0.id == line.speaker }) else { return .yellow }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
        UIColor(hex: p.color).getRed(&r, green: &g, blue: &b, alpha: nil)
        let lift: CGFloat = 0.55
        return Color(red: r + (1 - r) * lift, green: g + (1 - g) * lift, blue: b + (1 - b) * lift)
    }

    /// Cinema subtitles: big bold white on black, speaker name in their colour above.
    var body: some View {
        VStack(spacing: 6) {
            Text(Roster.name(line.speaker).uppercased())
                .font(.footnote.weight(.heavy)).tracking(1)
                .foregroundStyle(accent)
            Text(line.text)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .minimumScaleFactor(0.7)
            if let p = line.provisions.first { Text(p.label).font(.caption.monospaced().weight(.semibold)).foregroundStyle(.orange) }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Color.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 12).padding(.bottom, 8)
        .id(line.id)
        .transition(.opacity)
    }
}

private struct StampView: View {
    let text: String
    @State private var landed = false

    var body: some View {
        Text(text)
            .font(.system(size: 54, weight: .black, design: .serif))
            .foregroundStyle(.red)
            .padding(.horizontal, 14)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.red, lineWidth: 6))
            .rotationEffect(.degrees(-12))
            .scaleEffect(landed ? 1 : 2.4)
            .opacity(landed ? 0.92 : 0)
            .onAppear { withAnimation(.spring(duration: 0.18, bounce: 0.3)) { landed = true } }
            .allowsHitTesting(false)
    }
}
