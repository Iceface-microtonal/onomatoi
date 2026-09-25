// swift-tools-version:5.9
// native_render — iOS 版 (Onomatoi) の発声を書き出す、Web 版との比較用の治具。
// OnomatoiCore はアプリ本体と同じく隣のフォルダ (/Volumes/Expansion/MacAPP/OnomatoiCore) を読む。
// 内部関数 (FormantRenderer.eventApplyingFollowingMoraAttenuation 等) を使うため testing を有効にしてビルドする:
//   cd test/native_render && swift build -c release -Xswiftc -enable-testing
import PackageDescription

let package = Package(
    name: "native_render",
    platforms: [.macOS(.v13)],
    dependencies: [.package(path: "../../../OnomatoiCore")],
    targets: [
        .executableTarget(name: "native_render",
                          dependencies: [.product(name: "OnomatoiCore", package: "OnomatoiCore")],
                          path: "Sources")
    ]
)
