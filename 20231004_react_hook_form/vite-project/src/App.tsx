import { useForm, SubmitHandler } from "react-hook-form";
import "./App.css";
import React from "react";

type Inputs = {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
};


function App() {
  const [formData, setFormData] = React.useState<string>("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<Inputs>({
    defaultValues: {
      a: true,
      b: true,
      c: false,
      d: false,
    },
  });
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    console.log(data)
    setFormData(JSON.stringify(data))
  };

  const isChecked = watch("a", true) || watch("b", true);

  return (
    <>
      <p>
        {formData}
      </p>
      <form onSubmit={handleSubmit(onSubmit)}>
        a<input type="checkbox" {...register("a")} />
        b<input type="checkbox" {...register("b")} />
        check all
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            if (e.target.checked) {
              setValue("a", true);
              setValue("b", true);
            } else {
              setValue("a", false);
              setValue("b", false);
            }
          }}
        />
        {errors.a && <p>{errors.a.message}</p>}
        {errors.b && <p>{errors.b.message}</p>}
        <br />
        c<input type="checkbox" {...register("c")} />
        {errors.c && <p>{errors.c.message}</p>}
        <br />
        d<input type="checkbox" {...register("d")} />
        {errors.d && <p>{errors.d.message}</p>}
        <input type="submit" />
      </form>
    </>
  );
}

export default App;
