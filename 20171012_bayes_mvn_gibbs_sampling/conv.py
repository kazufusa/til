import sys
import re

class CodeBlock(object):
    codemark = ["`", "`", "`"]

    def __init__(self):
        self.in_code_block = False
        self.start_mark = []
        self.end_mark = []

    def append(self, word):
        if not self.in_code_block:
            self.start_mark.append(word)
            self.start_mark = self.start_mark[-3:]
        else:
            self.end_mark.append(word)
            self.end_mark = self.end_mark[-3:]

        if self.start_mark == self.codemark and self.end_mark == self.codemark:
            self.in_code_block = False
            self.start_mark = []
            self.end_mark = []
        elif self.start_mark == self.codemark:
            self.in_code_block = True
    
    def is_in_codeblock(self):
        return self.in_code_block

class LatexText(object):
    def __init__(self):
        self.initmark = ""
        self.text = ""
        self.opened = False
        self.justclosed = False
        pass

    def clear(self):
        self.initmark = ""
        self.text = ""
        self.justclosed = False

    def append(self, word):
        if word == "$" and not self.opened:
            self.initmark = "$"
            self.opened = True
        elif (word == "$" and self.text == "" and self.opened):
            self.initmark = "$$"
        elif self.opened:
            self.text = self.text + word
            if (self.initmark == "$" and self.text[-1:] == "$") or (self.initmark == "$$" and self.text[-2:] == "$$"):
                self.opened = False
                self.justclosed = True

    def print(self):
        if self.initmark == "$$":
            ret = "<center>\n[tex:\n" + self.text[:-2] + "\n]\n</center>"
        if self.initmark == "$":
            self.text = self.text.replace("_", "\_")
            ret = "[tex:" + self.text[:-1] + "]"
        self.clear()
        return ret


if __name__ == '__main__':
    l = open(sys.argv[1]).read()
    l = l.replace("\n%matplotlib inline", "")
    o = ""

    latex = LatexText()
    code = CodeBlock()

    for i in l:
        code.append(i)

        if (code.is_in_codeblock()):
            o += i
            continue
        else:
            latex.append(i)

        if latex.opened:
            pass
        elif latex.justclosed:
            o += latex.print()
        else:
            o += i
            pass

    base64img = re.compile('^<img src="data:image/png;base64')
    for line in o.split("\n"):
        if base64img.match(line):
            print("[IMAGE]")
        else:
            print(line)
