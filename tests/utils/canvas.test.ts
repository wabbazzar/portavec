import { describe, it, expect } from 'vitest';
import { toGrayscale, grayscaleToImageData, cloneImageData, getPixel } from '../../src/utils/canvas';

describe('canvas utilities', () => {
  describe('toGrayscale', () => {
    it('should convert a white pixel to 255', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 255; // R
      imageData.data[1] = 255; // G
      imageData.data[2] = 255; // B
      imageData.data[3] = 255; // A

      const gray = toGrayscale(imageData);
      expect(gray[0]).toBe(255);
    });

    it('should convert a black pixel to 0', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 0;
      imageData.data[1] = 0;
      imageData.data[2] = 0;
      imageData.data[3] = 255;

      const gray = toGrayscale(imageData);
      expect(gray[0]).toBe(0);
    });

    it('should use luminosity formula for grayscale conversion', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 100; // R
      imageData.data[1] = 150; // G
      imageData.data[2] = 50;  // B
      imageData.data[3] = 255; // A

      const gray = toGrayscale(imageData);
      // Expected: 0.299 * 100 + 0.587 * 150 + 0.114 * 50 = 29.9 + 88.05 + 5.7 = 123.65 ≈ 124
      expect(gray[0]).toBe(124);
    });
  });

  describe('grayscaleToImageData', () => {
    it('should convert grayscale back to RGBA', () => {
      const gray = new Uint8ClampedArray([128]);
      const imageData = grayscaleToImageData(gray, 1, 1);

      expect(imageData.data[0]).toBe(128); // R
      expect(imageData.data[1]).toBe(128); // G
      expect(imageData.data[2]).toBe(128); // B
      expect(imageData.data[3]).toBe(255); // A (opaque)
    });
  });

  describe('cloneImageData', () => {
    it('should create an independent copy', () => {
      const original = new ImageData(2, 2);
      original.data[0] = 100;

      const clone = cloneImageData(original);
      clone.data[0] = 200;

      expect(original.data[0]).toBe(100);
      expect(clone.data[0]).toBe(200);
    });

    it('should preserve dimensions', () => {
      const original = new ImageData(5, 10);
      const clone = cloneImageData(original);

      expect(clone.width).toBe(5);
      expect(clone.height).toBe(10);
    });
  });

  describe('getPixel', () => {
    it('should return pixel value at specified coordinates', () => {
      const data = new Uint8ClampedArray([10, 20, 30, 40]);
      // 2x2 grid: [10, 20; 30, 40]
      expect(getPixel(data, 2, 0, 0)).toBe(10);
      expect(getPixel(data, 2, 1, 0)).toBe(20);
      expect(getPixel(data, 2, 0, 1)).toBe(30);
      expect(getPixel(data, 2, 1, 1)).toBe(40);
    });

    it('should return 0 for out-of-bounds coordinates', () => {
      const data = new Uint8ClampedArray([100]);
      expect(getPixel(data, 1, -1, 0)).toBe(0);
      expect(getPixel(data, 1, 1, 0)).toBe(0);
      expect(getPixel(data, 1, 0, -1)).toBe(0);
      expect(getPixel(data, 1, 0, 1)).toBe(0);
    });
  });
});
