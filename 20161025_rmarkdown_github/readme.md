# testing github_document

## generate document

```
$ make
$ git add . && git commit -m "initial commit"
$ git push
$ hub browse
```

## files

```
.
├── Makefile
├── main.md                       # generated markdown
├── main.rmd                      # rmarkdown template file
├── main_files                    # generated files
│   └── figure-markdown_github
│       └── unnamed-chunk-2-1.png
└── readme.md
```
