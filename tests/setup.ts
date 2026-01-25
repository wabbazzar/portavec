import '@testing-library/jest-dom';

// Canvas ImageData polyfill for tests that don't need full jsdom canvas
if (typeof ImageData === 'undefined') {
  class ImageDataPolyfill {
    width: number;
    height: number;
    data: Uint8ClampedArray;

    constructor(width: number, height: number);
    constructor(data: Uint8ClampedArray, width: number, height?: number);
    constructor(
      widthOrData: number | Uint8ClampedArray,
      heightOrWidth: number,
      heightParam?: number
    ) {
      if (typeof widthOrData === 'number') {
        // ImageData(width, height)
        this.width = widthOrData;
        this.height = heightOrWidth;
        this.data = new Uint8ClampedArray(widthOrData * heightOrWidth * 4);
      } else {
        // ImageData(data, width, height?)
        this.data = widthOrData;
        this.width = heightOrWidth;
        this.height = heightParam ?? (widthOrData.length / 4 / heightOrWidth);
      }
    }
  }

  (global as unknown as Record<string, unknown>).ImageData = ImageDataPolyfill;
}
