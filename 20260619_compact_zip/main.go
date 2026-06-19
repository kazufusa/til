// Command compactzip rewrites a zip-based container (zip / pptx / docx / xlsx)
// into a much smaller one by downscaling and recompressing the images inside it.
// It always applies maximum compression — there are no tuning options.
//
// It never "opens" the document as an Office file: it treats the input purely
// as a stream of zip entries. Entries that are not images are copied through
// byte-for-byte (their already-compressed data is passed straight to the output
// zip without recompression). Image entries are decoded, downscaled to fit
// maxEdge px, recompressed in the SAME image format, and written back under the
// SAME entry name — but only if the result is actually smaller, otherwise the
// original bytes are kept.
//
// Keeping the format and the filename means no relationship (.rels) or
// content-type references ever need rewriting, so the output is the same
// pptx/docx/xlsx, just lighter. Each image is re-encoded in its own format
// (PNG, JPEG, GIF, BMP, TIFF). Animated GIFs and vector parts (EMF/WMF) are
// passed through untouched.
//
// Compression is always maximum; there are no flags. The number of parallel
// workers comes from the COMPACTZIP_JOBS environment variable; when unset or
// invalid it falls back to runtime.GOMAXPROCS(0), which is container-aware in
// Go 1.25+ and reflects the CPU actually allocated on Cloud Run / Lambda. Set
// the env var only to override that auto-detected value.
//
// Usage:
//
//	compactzip deck.pptx deck.small.pptx   # in -> out
//	compactzip deck.pptx                   # in -> stdout
//	cat deck.pptx | compactzip > out.pptx  # pipe filter (stdin -> stdout)
//	COMPACTZIP_JOBS=4 compactzip in out    # cap parallelism at 4 workers
package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
)

// Maximum-compression settings, fixed (no flags).
const (
	maxEdge     = 800 // longest image edge in px; larger images are downscaled
	jpegQuality = 40  // JPEG re-encode quality
)

func main() {
	var inPath, outPath string
	switch args := os.Args[1:]; len(args) {
	case 0:
		// stdin -> stdout
	case 1:
		inPath = args[0]
	default:
		inPath, outPath = args[0], args[1]
	}

	if err := run(inPath, outPath, jobsFromEnv()); err != nil {
		fmt.Fprintln(os.Stderr, "compactzip:", err)
		os.Exit(1)
	}
}

// jobsFromEnv reads the worker count from COMPACTZIP_JOBS, falling back to the
// CPU the runtime is actually allowed to use when it is unset, non-numeric, or
// < 1. GOMAXPROCS(0) is container-aware in Go 1.25+: it honors the cgroup CPU
// limit (e.g. Cloud Run's CFS quota), so it reflects the allocated CPU instead
// of over-counting host cores the way runtime.NumCPU() does.
func jobsFromEnv() int {
	if n, err := strconv.Atoi(os.Getenv("COMPACTZIP_JOBS")); err == nil && n >= 1 {
		return n
	}
	return runtime.GOMAXPROCS(0)
}

func run(inPath, outPath string, jobs int) error {
	// Read the whole input into memory: zip's central directory lives at the
	// end of the file, so the archive/zip reader needs random access. Buffering
	// also lets us act as a stdin->stdout pipe filter.
	var raw []byte
	var err error
	if inPath == "" {
		raw, err = io.ReadAll(os.Stdin)
	} else {
		raw, err = os.ReadFile(inPath)
	}
	if err != nil {
		return fmt.Errorf("read input: %w", err)
	}

	var out io.Writer
	if outPath == "" {
		out = os.Stdout
	} else {
		f, err := os.Create(outPath)
		if err != nil {
			return fmt.Errorf("create output: %w", err)
		}
		defer f.Close()
		out = f
	}

	return compact(raw, jobs, out)
}

// compact reads the zip container in raw, shrinks its image entries using `jobs`
// parallel workers, and writes the rebuilt zip to out.
func compact(raw []byte, jobs int, out io.Writer) error {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}

	// Phase 1: shrink images concurrently across `jobs` workers. Image work
	// (decode + downscale + re-encode) is CPU-bound and the slow part; zip
	// reads are safe to do in parallel because the backing bytes.Reader serves
	// concurrent ReadAt calls. Results go to disjoint slice indices, so no
	// locking is needed. zip *writing* stays single-threaded in phase 2, since a
	// zip stream must be produced in order.
	shrunk := make([][]byte, len(zr.File)) // shrunk[i] != nil => replace entry i

	indices := make(chan int)
	var wg sync.WaitGroup
	for range jobs {
		wg.Go(func() {
			for i := range indices {
				f := zr.File[i]
				if newBytes, ok := shrinkImage(f); ok && int64(len(newBytes)) < int64(f.CompressedSize64) {
					shrunk[i] = newBytes
				}
			}
		})
	}
	for i, f := range zr.File {
		if !f.FileInfo().IsDir() && isImageEntry(f) {
			indices <- i
		}
	}
	close(indices)
	wg.Wait()

	// Phase 2: write every entry in its original order.
	zw := zip.NewWriter(out)
	for i, f := range zr.File {
		if err := writeEntry(zw, f, shrunk[i]); err != nil {
			return fmt.Errorf("entry %q: %w", f.Name, err)
		}
	}
	if err := zw.Close(); err != nil {
		return fmt.Errorf("finalize zip: %w", err)
	}
	return nil
}

// writeEntry writes one zip entry: the pre-shrunk image bytes if present
// (re-stored under the original name), otherwise a raw byte-for-byte copy.
func writeEntry(zw *zip.Writer, f *zip.File, shrunk []byte) error {
	if f.FileInfo().IsDir() {
		hdr := f.FileHeader
		_, err := zw.CreateHeader(&hdr)
		return err
	}
	if shrunk != nil {
		hdr := f.FileHeader    // keep the original name, modtime, etc.
		hdr.Method = zip.Store // already-compressed pixels: don't deflate again
		w, err := zw.CreateHeader(&hdr)
		if err != nil {
			return err
		}
		_, err = w.Write(shrunk)
		return err
	}
	return copyRaw(zw, f)
}

// copyRaw passes an entry's already-compressed bytes straight through, with no
// decompress/recompress cycle.
func copyRaw(zw *zip.Writer, f *zip.File) error {
	rc, err := f.OpenRaw()
	if err != nil {
		return err
	}
	hdr := f.FileHeader
	w, err := zw.CreateRaw(&hdr)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, rc)
	return err
}

func isImageEntry(f *zip.File) bool {
	switch strings.ToLower(path.Ext(f.Name)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff":
		return true
	}
	return false
}

// shrinkImage decodes, downscales, and recompresses an image entry, re-encoding
// it in its original format so the entry keeps its name and format. It returns
// the new bytes and whether a candidate was produced at all.
func shrinkImage(f *zip.File) (data []byte, ok bool) {
	rc, err := f.Open()
	if err != nil {
		return nil, false
	}
	raw, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return nil, false
	}

	// Flattening an animated GIF to a single frame would drop its animation,
	// so leave those untouched.
	if isAnimatedGIF(raw) {
		return nil, false
	}

	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, false // not a decodable raster image; leave it alone
	}

	// Normalize to NRGBA so we can resample uniformly (and keep any alpha).
	src := downscale(toNRGBA(img), maxEdge)
	return encodeImage(format, src)
}

// encodeImage re-encodes src in the format image.Decode reported, keeping the
// entry's original format. It returns false for formats we cannot write back.
func encodeImage(format string, src *image.NRGBA) (data []byte, ok bool) {
	var buf bytes.Buffer
	var err error
	switch format {
	case "jpeg":
		err = jpeg.Encode(&buf, src, &jpeg.Options{Quality: jpegQuality})
	case "png":
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		err = enc.Encode(&buf, src)
	case "gif":
		err = gif.Encode(&buf, src, nil) // quantizes to a 256-color palette
	case "bmp":
		err = bmp.Encode(&buf, src)
	case "tiff":
		err = tiff.Encode(&buf, src, &tiff.Options{Compression: tiff.Deflate})
	default:
		return nil, false // unknown format: don't risk changing it
	}
	if err != nil {
		return nil, false
	}
	return buf.Bytes(), true
}

// isAnimatedGIF reports whether raw is a GIF holding more than one frame.
func isAnimatedGIF(raw []byte) bool {
	if len(raw) < 3 || string(raw[:3]) != "GIF" {
		return false
	}
	g, err := gif.DecodeAll(bytes.NewReader(raw))
	return err == nil && len(g.Image) > 1
}

func toNRGBA(img image.Image) *image.NRGBA {
	if n, ok := img.(*image.NRGBA); ok {
		return n
	}
	b := img.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(dst, dst.Bounds(), img, b.Min, draw.Src)
	return dst
}

// downscale shrinks src so its longest edge is at most maxDim, using an
// alpha-weighted box filter (good quality for downscaling, pure stdlib).
// Images already within bounds are returned unchanged.
func downscale(src *image.NRGBA, maxDim int) *image.NRGBA {
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	if max(sw, sh) <= maxDim {
		return src
	}
	nw := max(1, sw*maxDim/max(sw, sh))
	nh := max(1, sh*maxDim/max(sw, sh))

	dst := image.NewNRGBA(image.Rect(0, 0, nw, nh))
	xRatio := float64(sw) / float64(nw)
	yRatio := float64(sh) / float64(nh)

	for dy := range nh {
		sy0, sy1 := srcSpan(dy, yRatio, sh)
		for dx := range nw {
			sx0, sx1 := srcSpan(dx, xRatio, sw)

			// Average the source box, weighting each pixel's color by its
			// alpha (premultiplied average) and the alpha by pixel count.
			var r, g, b, aSum, count int
			for yy := sy0; yy < sy1; yy++ {
				row := src.PixOffset(sx0, yy)
				for xx := sx0; xx < sx1; xx++ {
					i := row + (xx-sx0)*4
					a := int(src.Pix[i+3])
					r += int(src.Pix[i]) * a
					g += int(src.Pix[i+1]) * a
					b += int(src.Pix[i+2]) * a
					aSum += a
					count++
				}
			}
			di := dst.PixOffset(dx, dy)
			if aSum > 0 {
				dst.Pix[di] = uint8(r / aSum)
				dst.Pix[di+1] = uint8(g / aSum)
				dst.Pix[di+2] = uint8(b / aSum)
			}
			if count > 0 {
				dst.Pix[di+3] = uint8(aSum / count)
			}
		}
	}
	return dst
}

// srcSpan maps destination index d to the source pixel range [lo, hi) it covers
// (at least one pixel wide, clamped to limit).
func srcSpan(d int, ratio float64, limit int) (lo, hi int) {
	lo = int(float64(d) * ratio)
	hi = int(float64(d+1) * ratio)
	if hi <= lo {
		hi = lo + 1
	}
	return lo, min(hi, limit)
}
