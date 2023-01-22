# Next.js, Docker ans secrets

```sh
$ NEXT_PUBLIC_SECRET_KEY=SECRET_KEY docker build --progress=plain --secret id=NEXT_PUBLIC_SECRET_KEY,env=NEXT_PUBLIC_SECRET_KEY -t test:latest .
```
