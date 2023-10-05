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
    console.log(data);
    setFormData(JSON.stringify(data));
  };

  const isChecked = watch("a", true) || watch("b", true);

  return (
    <>
      <Form />
      <p>{formData}</p>
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

type Input2 = {
  checks: string[];
};

function Form() {
  const [formData, setFormData] = React.useState<string>("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid, isSubmitted, isSubmitting },
    setValue,
    trigger,
  } = useForm<Input2>({ defaultValues: { checks: ["a", "b", "c", "d"] }, mode: "onChange" });
  const onSubmit: SubmitHandler<Input2> = (data) => {
    setFormData(JSON.stringify(data));
  };
  React.useEffect(() => {
    trigger();
  }, []);
  const checks = watch("checks");
  const checksProps = {
    ...register("checks", {
      validate: {
        atLeastOneRequired: (value: string[]) => {
          return value.length >= 1 || "1つ以上選択してください";
        },
      },
    }),
  };
  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        a <input value="a" type="checkbox" {...checksProps} />
        b <input value="b" type="checkbox" {...checksProps} />
        c <input value="c" type="checkbox" {...checksProps} />
        d <input value="d" type="checkbox" {...checksProps} />
        <br />
        check a b
        <input
          type="checkbox"
          checked={checks.some((v) => ["a", "b"].includes(v))}
          onChange={(e) => {
            if (e.target.checked) {
              setValue("checks", ["a", "b", ...checks], {
                shouldValidate: true,
              });
            } else {
              setValue(
                "checks",
                checks.filter((v) => !["a", "b"].includes(v)),
                { shouldValidate: true },
              );
            }
          }}
        />
        <br />
        check all
        <input
          type="checkbox"
          checked={checks.length > 0}
          onChange={(e) => {
            if (e.target.checked) {
              setValue("checks", ["a", "b", "c", "d"], {
                shouldValidate: true,
              });
            } else {
              setValue("checks", [], { shouldValidate: true });
            }
          }}
        />
        <br />
        {errors.checks && (
          <p>
            {errors.checks.type}:{errors.checks.message}
          </p>
        )}
        {isSubmitted && <p>{formData}</p>}
        <input type="submit" disabled={!isValid || isSubmitting} />
      </form>
    </>
  );
}
