import SwiftUI

/// Pitch chooser (mirrors the PWA's "You have one (1) pitch."): Voice / Text / GitHub, optional turnover,
/// then straight into the roast.
struct PitchView: View {
    @Bindable var flow: FlowModel
    private var pocket: PocketModel { flow.pocket }

    enum Mode: String, CaseIterable, Identifiable {
        case voice = "🎙 Voice", text = "✍️ Text", repo = "🐙 GitHub"
        var id: String { rawValue }
    }

    @State private var mode: Mode = {
        #if DEBUG   // screenshot aid: -pitch-mode text|repo
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-pitch-mode"), i + 1 < a.count { return a[i + 1] == "repo" ? .repo : a[i + 1] == "text" ? .text : .voice }
        #endif
        return .voice
    }()
    @State private var text = ""
    @State private var dictated = false
    @State private var repo = ""
    @State private var error: String?
    @State private var transcribing = false
    @FocusState private var focus: Field?
    private enum Field { case text, repo }

    private static let github = try! NSRegularExpression(pattern: #"^(https?://)?(www\.)?github\.com/[\w.-]+/[\w.-]+/?(\.git)?$"#, options: .caseInsensitive)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("You have one (1) pitch.").font(.system(.title, design: .serif, weight: .bold))
                    Text("Two officers are listening. Both are already disappointed.").font(.subheadline).foregroundStyle(.secondary)
                }
                Picker("How", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: mode) { _, _ in error = nil; focus = nil }

                if mode == .voice { mic }
                if mode != .repo { editor } else { repoField }

                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            .padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {   // rides above the keyboard; clear of the floating tab bar
            Button(action: submit) {
                Text("Submit to the Commission").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(.bar)
        }
        .alert("Hmm.", isPresented: .init(get: { pocket.errorMessage != nil }, set: { if !$0 { pocket.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(pocket.errorMessage ?? "") }
    }

    // MARK: pieces

    private var mic: some View {
        let listening = pocket.phase == .listening
        return VStack(spacing: 8) {
            Button { Task { await toggleMic() } } label: {
                Image(systemName: listening ? "stop.fill" : "mic.fill")
                    .font(.system(size: 40))
                    .frame(width: 96, height: 96)
                    .background(Circle().fill(listening ? Color.red : Color.accentColor))
                    .foregroundStyle(.white)
                    .scaleEffect(listening ? 1.08 : 1)
                    .animation(.spring(duration: 0.25), value: listening)
            }
            .disabled(transcribing)
            Text(listening ? "Recording… tap to stop." : transcribing ? "Interpreting…" : "Tap, pitch, tap again.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Your pitch").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TextEditor(text: $text)
                .focused($focus, equals: .text)
                .frame(minHeight: 190)   // ≥ 8 lines
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("We're Uber for paperwork, powered by AI, on the blockchain…")
                            .foregroundStyle(.tertiary).padding(.horizontal, 13).padding(.vertical, 16).allowsHitTesting(false)
                    }
                }
                .onChange(of: text) { old, new in
                    if new.count > 2000 { text = String(new.prefix(2000)) }
                    if focus == .text, old != new { dictated = false }   // edited by hand -> typed
                }
            Text("\(text.count)/2000").font(.caption2).foregroundStyle(.tertiary).frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private var repoField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Public GitHub repository").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TextField("https://github.com/you/startup", text: $repo)
                .keyboardType(.URL).textContentType(.URL)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .focused($focus, equals: .repo)
                .textFieldStyle(.roundedBorder)
            Text("The officers will read it. Public repositories only.").font(.caption).foregroundStyle(.secondary)
        }
    }

    // MARK: actions

    private func toggleMic() async {
        if pocket.phase == .listening {
            transcribing = true
            defer { transcribing = false }
            if let t = await pocket.finishDictation(), !t.isEmpty {
                text = t
                dictated = true   // only hand edits (editor focused) flip it back
            }
        } else {
            focus = nil
            await pocket.beginDictation()
        }
    }

    private func submit() {
        func wrap(_ s: Submission) -> Submission { s }   // turnover is estimated by the server now
        if mode == .repo {
            let url = repo.trimmingCharacters(in: .whitespacesAndNewlines)
            let ok = Self.github.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)) != nil
            guard ok else { error = "Not a GitHub repository. Format: github.com/owner/repo (public)."; return }
            let full = url.lowercased().hasPrefix("http") ? url : "https://\(url)"
            flow.submitPitch(wrap(.repo(full)), label: full)
        } else {
            let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard t.count >= 3 else {
                error = mode == .voice ? "Record your pitch first (or type it)." : "A pitch requires words. At least three letters."
                return
            }
            flow.submitPitch(wrap(dictated ? .dictation(t) : .text(t)), label: t, dictated: dictated)
        }
    }
}
