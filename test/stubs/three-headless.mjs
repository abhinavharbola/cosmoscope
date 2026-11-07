export * from "../../vendor/three.module.js";

export class WebGLRenderer {
  constructor(options) {
    this.domElement = options.canvas;
    this.debug = {};
    this.info = { render: { calls: 0, triangles: 0 } };
    this.toneMapping = 0;
    this.renders = 0;
  }

  setPixelRatio() {}

  setSize() {}

  getContext() {
    return { getExtension: () => null, getParameter: () => "headless" };
  }

  render() {
    this.renders += 1;
    this.info.render.calls = 1;
  }
}
