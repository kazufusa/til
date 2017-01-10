package main

/*
#include <stdio.h>
#include <stdlib.h>
#include "gdal_version.h"
#include "ogr_api.h"
#cgo darwin pkg-config: gdal
#cgo linux  pkg-config: gdal
#cgo windows CFLAGS: -I ./release-1800-x64-gdal-1-11-4-mapserver-6-4-3-libs/include
#cgo windows LDFLAGS: -L ./release-1800-x64-gdal-1-11-4-mapserver-6-4-3-libs/lib/ -lgdal_i
*/
import "C"

import (
	"fmt"
	"os"
	"unsafe"
)

func main() {

	if len(os.Args) == 1 {
		fmt.Println("No file specified")
		os.Exit(128)
	}

	fmt.Printf("GDAL: Version = %d.%d.%d, Version Num = %d, Build = %d, Release Date = %d, Release Name = %s\n",
		C.GDAL_VERSION_MAJOR,
		C.GDAL_VERSION_MINOR,
		C.GDAL_VERSION_REV,
		C.GDAL_VERSION_NUM,
		C.GDAL_VERSION_BUILD,
		C.GDAL_RELEASE_DATE,
		C.GDAL_RELEASE_NAME,
	)

	fmt.Println("AB")
	C.OGRRegisterAll()

	fmt.Println("A")
	p := C.OGR_G_CreateGeometry(C.wkbPoint)
	C.OGR_G_SetPoint(p, 0, 141, 37.5, 0)
	fmt.Println("B")

	var hds C.OGRDataSourceH
	var dsname = C.CString(os.Args[1])

	hds = C.OGROpen(dsname, 0, nil)

	C.free(unsafe.Pointer(dsname))

	if hds == nil {
		fmt.Printf("Failed to open dataset: %s", os.Args[1])
		os.Exit(129)
	}

	defer func() {
		C.OGR_DS_Destroy(hds)
	}()

	count := C.OGR_DS_GetLayerCount(hds)

	if int(count) == 0 {
		fmt.Println("no layers found in dataset")
		os.Exit(129)
	}

	layer := C.OGR_DS_GetLayer(hds, C.int(0))

	C.OGR_L_ResetReading(layer)

	fmt.Println(C.GoString(C.OGR_L_GetName(layer))) // should be free
	for {
		feature := C.OGR_L_GetNextFeature(layer)

		if feature == nil {
			break
		}
		fmt.Println(C.GoString(C.OGR_FD_GetName(C.OGR_F_GetDefnRef(feature)))) // should be free

		geom := C.OGR_F_GetGeometryRef(feature)

		if geom != nil {
			fmt.Println(C.OGR_G_Contains(geom, p))
			fmt.Println(C.GoString(C.OGR_G_GetGeometryName(geom))) // should be free
			// c_ptr := C.OGR_G_ExportToJson(geom)
			// json := C.GoString(c_ptr)
			// C.free(unsafe.Pointer(c_ptr))
			// fmt.Println(json)
		}

		C.OGR_F_Destroy(feature)

	}

	C.OGR_F_Destroy(p)
}
