import Foundation

/// The six paired officers (docs/PERSONA.md) and the three fixed pairs. Used as the offline roster
/// and as the fallback when /api/personas is unreachable. Colours are the placeholder-figure tints.
enum Roster {
    static let officers: [Persona] = [
        Persona(id: "formblatt", name: "Dr. Heinrich Formblatt", title: "Senior Rapporteur, Unit C.4", color: "#7B8794"),
        Persona(id: "annexe", name: "Mme Ségolène Annexe-Vandamme", title: "Director for the Proportionality of Proportionality", color: "#1F3A5F"),
        Persona(id: "grandma-gdpr", name: "Oma Gerda", title: "Knitting in the DPO's office", color: "#B5838D"),
        Persona(id: "auditor-9000", name: "AUDITOR-9000", title: "Mainframe, Berlaymont basement", color: "#3F8F5A"),
        Persona(id: "de-vries", name: "Inspector Pim de Vries", title: "NIS2 Incident Response Unit", color: "#2E4A2E"),
        Persona(id: "the-cookie", name: "The Cookie", title: "A sentient consent banner", color: "#C68B3E"),
    ]

    static let pairs: [Pair] = [
        Pair(id: "commission", officers: ["formblatt", "annexe"]),
        Pair(id: "basement", officers: ["grandma-gdpr", "auditor-9000"]),
        Pair(id: "raid", officers: ["de-vries", "the-cookie"]),
    ]

    static func pair(containing id: String) -> Pair {
        pairs.first { $0.officers.contains(id) } ?? pairs[0]
    }

    static func name(_ id: String) -> String {
        officers.first { $0.id == id }?.name ?? id
    }
}
