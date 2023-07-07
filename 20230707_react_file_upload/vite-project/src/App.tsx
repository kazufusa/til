import { useState, useRef, useEffect } from "react";
import "./App.css";


type ImageFIle = {
  file: File;
  imagePreviewUrl: string | null;
}

function App() {
  const [file, setFile] = useState<ImageFIle | null>(null);
  const [size, setSize] = useState<string>("");
  const ref = useRef<HTMLImageElement>(null);
  const onChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      var reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string' || reader.result === null) {
          setFile({ file, imagePreviewUrl: reader.result })
        }
      }
      reader.readAsDataURL(file);
    } else {
      setFile(null)
    }
  };

  const handleImageLoad = () => {
    setSize(`${ref.current?.naturalWidth} x ${ref.current?.naturalHeight}`)
  };

  useEffect(() => {
    const element = ref.current
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
          <img ref={ref} src={file?.imagePreviewUrl ?? ""} style={{
            width: "100px",
            height: "100px",
            objectFit: "contain",
          }} />
          {size}
        </div>
      </div>
    </>
  );
}

export default App;
