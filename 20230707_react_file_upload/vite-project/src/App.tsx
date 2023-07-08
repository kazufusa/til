import { useState, useRef, useEffect } from "react";
import "./App.css";

type ImageFile = {
  file: File;
  imagePreviewUrl: string | null;
  width?: number;
  height?: number;
};

function App() {
  const [file, setFile] = useState<ImageFile | null>(null);
  const [size, setSize] = useState<string>("");
  const ref = useRef<HTMLImageElement>(null);
  const onChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      var reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string" || reader.result === null) {
          setFile({ file, imagePreviewUrl: reader.result });
        }
      };
      reader.readAsDataURL(file);
    } else {
      setFile(null);
    }
  };

  const handleImageLoad = () => {
    setSize(`${ref.current?.naturalWidth} x ${ref.current?.naturalHeight}`);
  };

  useEffect(() => {
    const element = ref.current;
    if (element) {
      element.addEventListener("load", handleImageLoad);
    }
    return () => {
      if (element) {
        element.removeEventListener("load", handleImageLoad);
      }
    };
  }, [ref.current]);

  return (
    <>
      <div>
        <div className="App-form">
          <input
            name="file"
            type="file"
            accept="image/*"
            onChange={onChangeFile}
          />
          <img
            ref={ref}
            src={file?.imagePreviewUrl ?? ""}
            style={{
              width: "100px",
              height: "100px",
              objectFit: "contain",
            }}
          />
          {size}
        </div>
      </div>
      <ImageList />
    </>
  );
}

function ImageList() {
  const [files, setFiles] = useState<ImageFile[]>([]);
  const onChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles([]);
    [...(e.target.files ?? [])].map((file) => {
      var reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (
          (typeof result === "string" || result === null) &&
          !files.find((f) => f.imagePreviewUrl === result)
        ) {
          setFiles((files) => [...files, { file, imagePreviewUrl: result }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const onLoadFile = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const url = (e.target as HTMLImageElement).src;
    const width = (e.target as HTMLImageElement).naturalWidth;
    const height = (e.target as HTMLImageElement).naturalHeight;
    setFiles((files) =>
      files.map((file) =>
        file.imagePreviewUrl === url ? { ...file, width, height } : { ...file }
      )
    );
  };
  return (
    <div>
      <input
        name="file"
        type="file"
        accept="image/*"
        multiple
        onChange={onChangeFile}
      />
      <ul>
        {files.map((file) => (
          <li key={`${file.imagePreviewUrl}`} >
            {file.width && file.height && `${file.width} x ${file.height}`}
            <img
              onLoad={onLoadFile}
              src={file.imagePreviewUrl ?? ""}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
