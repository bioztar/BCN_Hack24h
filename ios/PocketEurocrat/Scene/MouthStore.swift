import Foundation

/// Where the mouth is on each cut-out, as image fractions (u from left, v from top, half width, half height).
/// `mouths.json` is generated once by tools/mouthgen.swift (Apple Vision face landmarks);
/// `mouths-manual.json` holds the hand-placed entries for the object-form officers (screen face, cookie).
enum MouthStore {
    struct Rect {
        let u: Float, v: Float, hw: Float, hh: Float
    }

    private static let table: [String: Rect] = {
        var out: [String: Rect] = [:]
        for file in ["mouths", "mouths-manual"] {   // manual wins
            guard let url = Bundle.main.url(forResource: file, withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [String: [Double]] else { continue }
            for (name, v) in raw where v.count == 4 {
                out[name] = Rect(u: Float(v[0]), v: Float(v[1]), hw: Float(v[2]), hh: Float(v[3]))
            }
        }
        return out
    }()

    static func rect(for name: String) -> Rect? { table[name] }
}
