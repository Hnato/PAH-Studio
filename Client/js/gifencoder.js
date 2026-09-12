/**
 * Lightweight Zero-Dependency GIF89a Animation Encoder for PAH Studio
 * Supports multi-frame animations, customizable delays/FPS, and transparency.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PAHGifEncoder = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function ByteArray() {
        this.bin = [];
    }
    ByteArray.prototype.writeByte = function (val) {
        this.bin.push(val & 0xFF);
    };
    ByteArray.prototype.writeUTFBytes = function (string) {
        for (var l = string.length, i = 0; i < l; i++)
            this.writeByte(string.charCodeAt(i));
    };
    ByteArray.prototype.writeBytes = function (array, offset, length) {
        var l = length || array.length;
        for (var i = offset || 0; i < l; i++)
            this.writeByte(array[i]);
    };
    ByteArray.prototype.getData = function () {
        return new Uint8Array(this.bin);
    };

    function LZWEncoder(width, height, pixels, colorDepth) {
        var initCodeSize = Math.max(2, colorDepth);
        var accum = new Uint8Array(256);
        var htab = new Int32Array(5003);
        var codetab = new Int32Array(5003);
        var cur_accum = 0;
        var cur_bits = 0;
        var a_count = 0;
        var free_ent = 0;
        var maxcode = 0;
        var clear_flg = false;
        var g_init_bits = initCodeSize + 1;
        var n_bits = g_init_bits;
        var cur_sub = 0;

        function MAXCODE(n) { return (1 << n) - 1; }

        function char_out(c, outs) {
            accum[a_count++] = c;
            if (a_count >= 254) flush_char(outs);
        }

        function flush_char(outs) {
            if (a_count > 0) {
                outs.writeByte(a_count);
                outs.writeBytes(accum, 0, a_count);
                a_count = 0;
            }
        }

        function output(code, outs) {
            cur_accum |= (code << cur_bits);
            cur_bits += n_bits;
            while (cur_bits >= 8) {
                char_out(cur_accum & 0xff, outs);
                cur_accum >>= 8;
                cur_bits -= 8;
            }
            if (free_ent > maxcode || clear_flg) {
                if (clear_flg) {
                    maxcode = MAXCODE(n_bits = g_init_bits);
                    clear_flg = false;
                } else {
                    n_bits++;
                    maxcode = (n_bits === 12) ? (1 << 12) : MAXCODE(n_bits);
                }
            }
            if (code === (1 << initCodeSize) + 1) {
                while (cur_bits > 0) {
                    char_out(cur_accum & 0xff, outs);
                    cur_accum >>= 8;
                    cur_bits -= 8;
                }
                flush_char(outs);
            }
        }

        this.encode = function (outs) {
            outs.writeByte(initCodeSize);
            var remaining = width * height;
            var curPixel = 0;
            var clearCode = 1 << initCodeSize;
            var EOFCode = clearCode + 1;
            free_ent = clearCode + 2;
            n_bits = g_init_bits;
            maxcode = MAXCODE(n_bits);
            clear_flg = false;
            for (var i = 0; i < 5003; i++) htab[i] = -1;

            output(clearCode, outs);

            var ent = pixels[curPixel++];
            while (curPixel < pixels.length) {
                var c = pixels[curPixel++];
                var fcode = (c << 12) + ent;
                var i = ((c << 4) ^ ent) % 5003;
                if (htab[i] === fcode) {
                    ent = codetab[i];
                    continue;
                }
                var disp = 0;
                if (htab[i] >= 0) {
                    disp = 5003 - i;
                    if (i === 0) disp = 1;
                    do {
                        i = (i - disp + 5003) % 5003;
                        if (htab[i] === fcode) {
                            ent = codetab[i];
                            break;
                        }
                    } while (htab[i] >= 0);
                }
                if (htab[i] === fcode) continue;
                output(ent, outs);
                ent = c;
                if (free_ent < (1 << 12)) {
                    codetab[i] = free_ent++;
                    htab[i] = fcode;
                } else {
                    for (var k = 0; k < 5003; k++) htab[k] = -1;
                    free_ent = clearCode + 2;
                    clear_flg = true;
                    output(clearCode, outs);
                }
            }
            output(ent, outs);
            output(EOFCode, outs);
            outs.writeByte(0);
        };
    }

    function GIFEncoder(width, height) {
        this.width = width;
        this.height = height;
        this.frames = [];
        this.delay = 100; // ms
        this.repeat = 0; // loop forever
    }

    GIFEncoder.prototype.setDelay = function (ms) {
        this.delay = ms;
    };

    GIFEncoder.prototype.setRepeat = function (repeat) {
        this.repeat = repeat;
    };

    GIFEncoder.prototype.addFrame = function (ctx) {
        var imgData = ctx.getImageData(0, 0, this.width, this.height);
        this.frames.push(imgData);
    };

    GIFEncoder.prototype.render = function () {
        var out = new ByteArray();
        // Header
        out.writeUTFBytes("GIF89a");
        // Logical Screen Descriptor
        out.writeByte(this.width & 0xFF);
        out.writeByte((this.width >> 8) & 0xFF);
        out.writeByte(this.height & 0xFF);
        out.writeByte((this.height >> 8) & 0xFF);
        out.writeByte(0x70); // GCT Flag = 0, Color Res = 7 (8 bits)
        out.writeByte(0);    // Background Color Index
        out.writeByte(0);    // Pixel Aspect Ratio

        // Netscape Application Extension (Looping)
        if (this.repeat >= 0) {
            out.writeByte(0x21); // Extension Introducer
            out.writeByte(0xFF); // App Extension Label
            out.writeByte(11);   // Block Size
            out.writeUTFBytes("NETSCAPE2.0");
            out.writeByte(3);    // Sub-block size
            out.writeByte(1);    // Loop sub-block id
            out.writeByte(this.repeat & 0xFF);
            out.writeByte((this.repeat >> 8) & 0xFF);
            out.writeByte(0);    // Block Terminator
        }

        // Build global/frame palettes and write frames
        for (var f = 0; f < this.frames.length; f++) {
            var frame = this.frames[f];
            var data = frame.data;
            var palette = [];
            var colorMap = {};
            var indexedPixels = new Uint8Array(this.width * this.height);
            var transparentIndex = -1;

            // Palette Quantization (Up to 256 colors)
            for (var p = 0; p < data.length; p += 4) {
                var r = data[p];
                var g = data[p + 1];
                var b = data[p + 2];
                var a = data[p + 3];
                var pixelIdx = p / 4;

                if (a < 128) {
                    if (transparentIndex === -1) {
                        transparentIndex = palette.length;
                        palette.push([0, 0, 0]);
                    }
                    indexedPixels[pixelIdx] = transparentIndex;
                } else {
                    var key = (r << 16) | (g << 8) | b;
                    if (colorMap[key] === undefined) {
                        if (palette.length < 256) {
                            colorMap[key] = palette.length;
                            palette.push([r, g, b]);
                        } else {
                            colorMap[key] = 0; // fallback
                        }
                    }
                    indexedPixels[pixelIdx] = colorMap[key];
                }
            }

            // Pad palette to power of 2
            var bitDepth = Math.max(2, Math.ceil(Math.log2(Math.max(4, palette.length))));
            var paddedSize = 1 << bitDepth;
            while (palette.length < paddedSize) {
                palette.push([0, 0, 0]);
            }

            // Graphic Control Extension
            out.writeByte(0x21); // Extension
            out.writeByte(0xF9); // GCE
            out.writeByte(4);    // Block Size
            var hasTransparency = transparentIndex !== -1;
            out.writeByte(hasTransparency ? 0x09 : 0x08); // Disposal: Restore Background, Transparency
            var delayHundredths = Math.round(this.delay / 10);
            out.writeByte(delayHundredths & 0xFF);
            out.writeByte((delayHundredths >> 8) & 0xFF);
            out.writeByte(hasTransparency ? transparentIndex : 0); // Transparent color index
            out.writeByte(0);    // Terminator

            // Image Descriptor
            out.writeByte(0x2C); // Image Separator
            out.writeByte(0); out.writeByte(0); // Left Pos
            out.writeByte(0); out.writeByte(0); // Top Pos
            out.writeByte(this.width & 0xFF);
            out.writeByte((this.width >> 8) & 0xFF);
            out.writeByte(this.height & 0xFF);
            out.writeByte((this.height >> 8) & 0xFF);
            out.writeByte(0x80 | (bitDepth - 1)); // Local Color Table Present, Size

            // Local Color Table
            for (var c = 0; c < palette.length; c++) {
                out.writeByte(palette[c][0]);
                out.writeByte(palette[c][1]);
                out.writeByte(palette[c][2]);
            }

            // LZW Encoded Pixels
            var lzw = new LZWEncoder(this.width, this.height, indexedPixels, bitDepth);
            lzw.encode(out);
        }

        // Trailer
        out.writeByte(0x3B);
        return new Blob([out.getData()], { type: "image/gif" });
    };

    return GIFEncoder;
}));
