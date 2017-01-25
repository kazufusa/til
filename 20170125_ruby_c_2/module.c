#include <ruby.h>

double add(double a, double b);

VALUE wrap_add(VALUE self, VALUE aa, VALUE bb){
  double a, b, result;
  a = NUM2DBL(aa);
  b = NUM2DBL(bb);
  result = add(a,b);
  return rb_float_new(result);
}

void Init_mmath(){
  VALUE module;
  module = rb_define_module("Math");
  rb_define_module_function(module, "add", wrap_add, 2);
}
