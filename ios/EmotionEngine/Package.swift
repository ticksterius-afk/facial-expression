// swift-tools-version:5.9
import PackageDescription

// The expression engine shared by the iOS app. It interprets the same
// model/emotion-model.json as the web app (a copy is bundled as a resource —
// run `npm run sync:ios` in web/ after editing the model) and is tested against
// the TypeScript engine's golden outputs in model/fixtures/.
let package = Package(
    name: "EmotionEngine",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "EmotionEngine", targets: ["EmotionEngine"]),
    ],
    targets: [
        .target(
            name: "EmotionEngine",
            resources: [.copy("Resources/emotion-model.json")]
        ),
        .testTarget(
            name: "EmotionEngineTests",
            dependencies: ["EmotionEngine"]
        ),
    ]
)
