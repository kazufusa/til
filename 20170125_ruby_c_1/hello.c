#include "ruby.h"
#include <stdio.h>

void hello();

VALUE wrap_hello(self)
     VALUE self;
{
  printf("Hello, world!\n");
  return Qnil;
}

void Init_hello()
{
  VALUE module;

  module = rb_define_module("Hello");
  rb_define_module_function(module, "hello", wrap_hello, 0);
}
