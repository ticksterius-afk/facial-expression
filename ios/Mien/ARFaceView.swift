import ARKit
import SceneKit
import SwiftUI

/// Front-camera feed from the shared ARSession, with an optional face-mesh wireframe.
struct ARFaceView: UIViewRepresentable {
    let session: ARSession
    var showMesh: Bool

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = session
        view.delegate = context.coordinator
        view.automaticallyUpdatesLighting = false
        view.rendersContinuously = true
        return view
    }

    func updateUIView(_ view: ARSCNView, context: Context) {
        context.coordinator.showMesh = showMesh
    }

    final class Coordinator: NSObject, ARSCNViewDelegate {
        var showMesh = true {
            didSet { meshNode?.isHidden = !showMesh }
        }
        private var meshNode: SCNNode?

        func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
            guard anchor is ARFaceAnchor, let device = renderer.device, let geometry = ARSCNFaceGeometry(device: device) else { return nil }
            let material = geometry.firstMaterial!
            material.fillMode = .lines
            material.lightingModel = .constant
            material.diffuse.contents = UIColor(white: 1, alpha: 0.28)
            let node = SCNNode(geometry: geometry)
            node.isHidden = !showMesh
            meshNode = node
            return node
        }

        func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
            guard let face = anchor as? ARFaceAnchor, let geometry = node.geometry as? ARSCNFaceGeometry else { return }
            geometry.update(from: face.geometry)
        }
    }
}
