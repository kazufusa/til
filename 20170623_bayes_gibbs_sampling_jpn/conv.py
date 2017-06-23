import sys

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
            sys.stdout.write("<center>\n[tex:\n" + self.text[:-2] + "\n]\n</center>")
        if self.initmark == "$":
            self.text = self.text.replace("_", "\_")
            sys.stdout.write("[tex:" + self.text[:-1] + "]")
        self.clear()

class IndentedCodeBlock(object):
    startmark = "\n    "
    endmark  = "\n\n"

    def __init__(self):
        self.mark = ""
        self.text = ""
        self.opened = False
        self.justclosed = False
        pass

    def append(self, word):
        self.mark = (self.mark + word)[-5:]
        if self.mark == self.startmark and not self.opened:
            self.opened = True
            self.text = "\n\n```" + self.mark[:-1]
        if self.mark[-2:] == self.endmark and self.opened:
            self.justclosed = True
            self.opened = False
            self.text = self.text + word
        elif self.opened:
            self.text = self.text + word

    def print(self):
        self.justclosed = False
        self.text = self.text.replace("\n    ", "\n")[:-1] + "```\n\n"
        return self.text


if __name__ == '__main__':
    l = open(sys.argv[1]).read()
    nl = ""
    code = CodeBlock()
    indented_code = IndentedCodeBlock()

    for i in l:
        code.append(i)

        if (code.is_in_codeblock()):
            nl = nl + i
            continue
        else:
            indented_code.append(i)

        if indented_code.opened:
            pass
        elif indented_code.justclosed:
            nl = nl + indented_code.print()
            pass
        else:
            nl = nl + i

    l = nl
    l.replace("\n%matplotlib inline", "")

    latex = LatexText()
    code = CodeBlock()

    for i in l:
        code.append(i)

        if (code.is_in_codeblock()):
            sys.stdout.write(i)
            continue
        else:
            latex.append(i)

        if latex.opened:
            pass
        elif latex.justclosed:
            latex.print()
        else:
            sys.stdout.write(i)
            pass
