import PhotosUI
import SwiftUI

/// "Register your startup and build a real business in the EU!" — name, founder, optional selfie.
struct RegisterView: View {
    @Bindable var flow: FlowModel
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @FocusState private var focus: Field?
    private enum Field { case startup, founder, oneLiner }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    Text("🇪🇺").font(.system(size: 54))
                    Text("Pitch your startup. The EU will refuse it. In 15 seconds.")
                        .font(.system(.title2, design: .serif, weight: .bold))
                        .multilineTextAlignment(.center)
                    Text("Eurocrat Commission · DG ROAST · Form A-1")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(.top, 24)

                field("Startup name", text: $flow.startupName, id: .startup)

                Button {
                    focus = nil
                    Task { await flow.register() }
                } label: {
                    HStack {
                        if flow.busy { ProgressView().tint(.white) }
                        Text("Get refused →").fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!flow.canRegister || flow.busy)

                field("Founder (optional)", text: $flow.founderName, id: .founder)

                selfie

                Text("☑ I have read and accepted the 4,212 pages of terms. ☑ I consent to consenting. Satire — your data is used for the joke and the leaderboard only.")
                    .font(.caption2).foregroundStyle(.tertiary).multilineTextAlignment(.center)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {   // "New startup": founder + selfie are kept, the name is empty and ready
            if flow.startupName.isEmpty, !flow.founderName.isEmpty || flow.photo != nil { focus = .startup }
        }
        .alert("Hmm.", isPresented: .init(get: { flow.errorMessage != nil }, set: { if !$0 { flow.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(flow.errorMessage ?? "") }
        .onChange(of: pickerItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self), let img = UIImage(data: data) { flow.photo = img }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in flow.photo = image; showCamera = false } onCancel: { showCamera = false }
                .ignoresSafeArea()
        }
    }

    private func field(_ title: String, text: Binding<String>, id: Field) -> some View {
        TextField(title, text: text)
            .focused($focus, equals: id)
            .textFieldStyle(.roundedBorder)
            .submitLabel(.next)
            .onSubmit { focus = id == .startup ? .founder : nil }
    }

    private var selfie: some View {
        HStack(spacing: 14) {
            Group {
                if let photo = flow.photo {
                    Image(uiImage: photo).resizable().scaledToFill()
                } else {
                    Image(systemName: "person.crop.circle").resizable().scaledToFit().foregroundStyle(.secondary).padding(10)
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(Circle())
            .overlay(Circle().stroke(.secondary.opacity(0.4)))

            VStack(alignment: .leading, spacing: 8) {
                Text("Mugshot for the leaderboard (optional)").font(.subheadline.weight(.semibold))
                HStack {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take selfie") { showCamera = true }.buttonStyle(.bordered)
                    }
                    PhotosPicker("Choose", selection: $pickerItem, matching: .images).buttonStyle(.bordered)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// Minimal camera sheet (UIImagePickerController).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.cameraDevice = .front
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) } else { parent.onCancel() }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onCancel() }
    }
}
