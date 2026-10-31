export const SRGBColorSpace = "srgb";
export const NoColorSpace = "";

export class CanvasTexture {
  constructor(image) {
    this.image = image;
  }
}

export class TextureLoader {
  async loadAsync() {
    throw new Error("TextureLoader is not available in the test stub");
  }
}
