package main

import (
	"archive/zip"
	"bytes"
	"image"
	"image/color"
	"image/color/palette"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"testing"

	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
)

// --- helpers ---------------------------------------------------------------

type entry struct {
	name string
	data []byte
}

// noise returns a deterministic pseudo-random byte for (x, y, channel). Using
// high-entropy pixels makes the full-resolution image incompressible (large),
// while box-filter downscaling averages it toward mid-tones (small) — so a
// genuine size reduction is guaranteed for every format.
func noise(x, y, ch int) uint8 {
	h := uint32(x)*73856093 ^ uint32(y)*19349663 ^ uint32(ch)*83492791
	h ^= h >> 13
	h *= 0x5bd1e995
	h ^= h >> 15
	return uint8(h)
}

// makeRaster builds a w×h high-entropy image encoded in the given format.
func makeRaster(t *testing.T, format string, w, h int, withAlpha bool) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			a := uint8(255)
			if withAlpha {
				a = noise(x, y, 3)
			}
			img.SetNRGBA(x, y, color.NRGBA{noise(x, y, 0), noise(x, y, 1), noise(x, y, 2), a})
		}
	}
	var buf bytes.Buffer
	var err error
	switch format {
	case "png":
		err = png.Encode(&buf, img)
	case "jpeg":
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90})
	case "gif":
		err = gif.Encode(&buf, img, nil)
	case "bmp":
		err = bmp.Encode(&buf, img)
	case "tiff":
		err = tiff.Encode(&buf, img, nil) // uncompressed original
	default:
		t.Fatalf("unknown format %q", format)
	}
	if err != nil {
		t.Fatalf("encode %s: %v", format, err)
	}
	return buf.Bytes()
}

// makeAnimatedGIF builds a two-frame animated GIF.
func makeAnimatedGIF(t *testing.T, w, h int) []byte {
	t.Helper()
	var frames []*image.Paletted
	var delays []int
	for f := range 2 {
		p := image.NewPaletted(image.Rect(0, 0, w, h), palette.Plan9)
		for y := range h {
			for x := range w {
				p.Set(x, y, color.RGBA{uint8(x + f*40), uint8(y), 0, 255})
			}
		}
		frames = append(frames, p)
		delays = append(delays, 10)
	}
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, &gif.GIF{Image: frames, Delay: delays}); err != nil {
		t.Fatalf("encode animated gif: %v", err)
	}
	return buf.Bytes()
}

func buildZip(t *testing.T, entries []entry) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		w, err := zw.Create(e.name)
		if err != nil {
			t.Fatalf("zip create %s: %v", e.name, err)
		}
		if _, err := w.Write(e.data); err != nil {
			t.Fatalf("zip write %s: %v", e.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return buf.Bytes()
}

func readZip(t *testing.T, raw []byte) []entry {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}
	var out []entry
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", f.Name, err)
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("read %s: %v", f.Name, err)
		}
		out = append(out, entry{f.Name, b})
	}
	return out
}

func entryByName(es []entry, name string) (entry, bool) {
	for _, e := range es {
		if e.name == name {
			return e, true
		}
	}
	return entry{}, false
}

func compactBytes(t *testing.T, raw []byte, jobs int) []byte {
	t.Helper()
	var out bytes.Buffer
	if err := compact(raw, jobs, &out); err != nil {
		t.Fatalf("compact: %v", err)
	}
	return out.Bytes()
}

// --- behavior specs --------------------------------------------------------

// Every supported raster format is downscaled to maxEdge, re-encoded smaller,
// and keeps its name and format.
func TestCompact_ShrinksEachFormat(t *testing.T) {
	cases := []struct {
		ext, format string
	}{
		{"png", "png"},
		{"jpg", "jpeg"},
		{"gif", "gif"},
		{"bmp", "bmp"},
		{"tif", "tiff"},
	}
	for _, c := range cases {
		t.Run(c.format, func(t *testing.T) {
			name := "media/img." + c.ext
			in := buildZip(t, []entry{{name, makeRaster(t, c.format, 2000, 1500, false)}})
			out := compactBytes(t, in, 4)

			got, ok := entryByName(readZip(t, out), name)
			if !ok {
				t.Fatalf("entry %q missing in output", name)
			}
			if len(got.data) >= len(entryByName2(t, in, name)) {
				t.Errorf("%s not shrunk: in=%d out=%d", name, len(entryByName2(t, in, name)), len(got.data))
			}

			img, format, err := image.Decode(bytes.NewReader(got.data))
			if err != nil {
				t.Fatalf("decode output %s: %v", c.format, err)
			}
			if format != c.format {
				t.Errorf("format changed: got %q want %q", format, c.format)
			}
			b := img.Bounds()
			if longest := max(b.Dx(), b.Dy()); longest > maxEdge {
				t.Errorf("not downscaled: longest edge %d > %d", longest, maxEdge)
			}
			// 2000x1500 (4:3) -> expect 800x600.
			if b.Dx() != 800 || b.Dy() != 600 {
				t.Errorf("unexpected dims %dx%d, want 800x600", b.Dx(), b.Dy())
			}
		})
	}
}

// entryByName2 returns the raw stored-entry payload length helper for the input.
func entryByName2(t *testing.T, raw []byte, name string) []byte {
	t.Helper()
	e, ok := entryByName(readZip(t, raw), name)
	if !ok {
		t.Fatalf("input entry %q missing", name)
	}
	return e.data
}

// Non-image entries and overall entry order are preserved exactly.
func TestCompact_PreservesNonImagesAndOrder(t *testing.T) {
	xml := []byte(`<?xml version="1.0"?><root>hello</root>`)
	in := buildZip(t, []entry{
		{"[Content_Types].xml", xml},
		{"ppt/slides/slide1.xml", []byte("<slide/>")},
		{"ppt/media/image1.png", makeRaster(t, "png", 1600, 1200, false)},
		{"ppt/media/image2.emf", []byte("EMF-VECTOR-DATA-not-an-image")},
	})
	out := compactBytes(t, in, 2)

	inE, outE := readZip(t, in), readZip(t, out)
	if len(inE) != len(outE) {
		t.Fatalf("entry count changed: in=%d out=%d", len(inE), len(outE))
	}
	for i := range inE {
		if inE[i].name != outE[i].name {
			t.Errorf("order/name changed at %d: %q vs %q", i, inE[i].name, outE[i].name)
		}
	}
	// Non-image entries must be byte-identical.
	for _, name := range []string{"[Content_Types].xml", "ppt/slides/slide1.xml", "ppt/media/image2.emf"} {
		gi, _ := entryByName(inE, name)
		go_, _ := entryByName(outE, name)
		if !bytes.Equal(gi.data, go_.data) {
			t.Errorf("%q was modified", name)
		}
	}
}

// Animated GIFs are passed through untouched (animation preserved).
func TestCompact_AnimatedGIFPassthrough(t *testing.T) {
	anim := makeAnimatedGIF(t, 1200, 900)
	in := buildZip(t, []entry{{"media/anim.gif", anim}})
	out := compactBytes(t, in, 4)

	got, ok := entryByName(readZip(t, out), "media/anim.gif")
	if !ok {
		t.Fatal("anim.gif missing")
	}
	if !bytes.Equal(got.data, anim) {
		t.Error("animated gif was re-encoded; should be passed through unchanged")
	}
	g, err := gif.DecodeAll(bytes.NewReader(got.data))
	if err != nil {
		t.Fatalf("decode anim: %v", err)
	}
	if len(g.Image) != 2 {
		t.Errorf("frame count = %d, want 2", len(g.Image))
	}
}

// An image entry never grows: if re-encoding isn't smaller, the original is kept.
func TestCompact_NeverGrows(t *testing.T) {
	in := buildZip(t, []entry{
		{"big.png", makeRaster(t, "png", 2000, 1500, false)},
		{"tiny.png", makeRaster(t, "png", 8, 8, false)},
	})
	out := compactBytes(t, in, 4)

	inSizes := entrySizes(t, in)
	outSizes := entrySizes(t, out)
	for name, inSz := range inSizes {
		if outSizes[name] > inSz {
			t.Errorf("%q grew: in=%d out=%d", name, inSz, outSizes[name])
		}
	}
}

func entrySizes(t *testing.T, raw []byte) map[string]uint64 {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("read zip: %v", err)
	}
	m := map[string]uint64{}
	for _, f := range zr.File {
		m[f.Name] = f.CompressedSize64
	}
	return m
}

// Output is byte-for-byte identical regardless of worker count.
func TestCompact_DeterministicAcrossJobs(t *testing.T) {
	in := buildZip(t, []entry{
		{"a.png", makeRaster(t, "png", 1600, 1200, false)},
		{"b.jpg", makeRaster(t, "jpeg", 1800, 1000, false)},
		{"c.tif", makeRaster(t, "tiff", 1200, 1200, false)},
		{"doc.xml", []byte("<x/>")},
	})
	one := compactBytes(t, in, 1)
	many := compactBytes(t, in, 8)
	if !bytes.Equal(one, many) {
		t.Error("output differs between jobs=1 and jobs=8 (non-deterministic)")
	}
}

// PNG transparency survives downscaling and re-encoding.
func TestCompact_PreservesAlpha(t *testing.T) {
	in := buildZip(t, []entry{{"media/t.png", makeRaster(t, "png", 1000, 800, true)}})
	out := compactBytes(t, in, 2)

	got, _ := entryByName(readZip(t, out), "media/t.png")
	img, format, err := image.Decode(bytes.NewReader(got.data))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if format != "png" {
		t.Fatalf("format = %q, want png", format)
	}
	transparent := false
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y && !transparent; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := img.At(x, y).RGBA(); a < 0xffff {
				transparent = true
				break
			}
		}
	}
	if !transparent {
		t.Error("alpha channel lost: no transparent pixel found")
	}
}

// A non-zip input is reported as an error rather than panicking.
func TestCompact_InvalidZip(t *testing.T) {
	if err := compact([]byte("not a zip at all"), 4, io.Discard); err == nil {
		t.Error("expected error for non-zip input")
	}
}

// A zip with no image entries comes back valid and unchanged in structure.
func TestCompact_NoImages(t *testing.T) {
	in := buildZip(t, []entry{{"a.txt", []byte("hello")}, {"b.xml", []byte("<b/>")}})
	out := compactBytes(t, in, 4)
	es := readZip(t, out)
	if len(es) != 2 {
		t.Fatalf("entry count = %d, want 2", len(es))
	}
}

// --- unit tests ------------------------------------------------------------

func TestDownscale(t *testing.T) {
	cases := []struct {
		name         string
		w, h         int
		wantW, wantH int
	}{
		{"landscape", 1600, 800, 800, 400},
		{"portrait", 800, 1600, 400, 800},
		{"within bounds unchanged", 400, 300, 400, 300},
		{"exactly maxEdge", 800, 600, 800, 600},
		{"1x1", 1, 1, 1, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			src := image.NewNRGBA(image.Rect(0, 0, c.w, c.h))
			got := downscale(src, maxEdge)
			if got.Bounds().Dx() != c.wantW || got.Bounds().Dy() != c.wantH {
				t.Errorf("downscale %dx%d = %dx%d, want %dx%d",
					c.w, c.h, got.Bounds().Dx(), got.Bounds().Dy(), c.wantW, c.wantH)
			}
		})
	}
}

func TestSrcSpan(t *testing.T) {
	cases := []struct {
		d, limit       int
		ratio          float64
		wantLo, wantHi int
	}{
		{0, 10, 2.0, 0, 2},
		{1, 10, 2.0, 2, 4},
		{3, 10, 0.5, 1, 2},  // downscale-by-2: span at least 1 wide
		{3, 10, 2.5, 7, 10}, // last column clamped to limit
	}
	for _, c := range cases {
		lo, hi := srcSpan(c.d, c.ratio, c.limit)
		if lo != c.wantLo || hi != c.wantHi {
			t.Errorf("srcSpan(%d, %v, %d) = (%d,%d), want (%d,%d)",
				c.d, c.ratio, c.limit, lo, hi, c.wantLo, c.wantHi)
		}
		if hi <= lo {
			t.Errorf("srcSpan(%d, %v, %d): empty span (%d,%d)", c.d, c.ratio, c.limit, lo, hi)
		}
	}
}

func TestIsImageEntry(t *testing.T) {
	images := []string{"a.png", "A.PNG", "b.jpg", "b.jpeg", "c.gif", "d.bmp", "e.tif", "e.tiff"}
	others := []string{"x.xml", "y.emf", "z.wmf", "doc", "a.txt", "n.svg"}
	for _, n := range images {
		if !isImageEntry(&zip.File{FileHeader: zip.FileHeader{Name: n}}) {
			t.Errorf("isImageEntry(%q) = false, want true", n)
		}
	}
	for _, n := range others {
		if isImageEntry(&zip.File{FileHeader: zip.FileHeader{Name: n}}) {
			t.Errorf("isImageEntry(%q) = true, want false", n)
		}
	}
}

func TestIsAnimatedGIF(t *testing.T) {
	if !isAnimatedGIF(makeAnimatedGIF(t, 64, 64)) {
		t.Error("multi-frame gif reported as not animated")
	}
	if isAnimatedGIF(makeRaster(t, "gif", 64, 64, false)) {
		t.Error("single-frame gif reported as animated")
	}
	if isAnimatedGIF(makeRaster(t, "png", 64, 64, false)) {
		t.Error("png reported as animated gif")
	}
}

func TestJobsFromEnv(t *testing.T) {
	t.Setenv("COMPACTZIP_JOBS", "3")
	if got := jobsFromEnv(); got != 3 {
		t.Errorf("jobsFromEnv() = %d, want 3", got)
	}
	for _, bad := range []string{"", "0", "-2", "abc"} {
		t.Setenv("COMPACTZIP_JOBS", bad)
		if got := jobsFromEnv(); got < 1 {
			t.Errorf("jobsFromEnv() with %q = %d, want >= 1 (fallback)", bad, got)
		}
	}
}
