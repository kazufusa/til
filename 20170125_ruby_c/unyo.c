#include <ruby.h>

VALUE gunyo(VALUE self, VALUE va, VALUE vb, VALUE vc){
  VALUE r;
  int a,b,c,d;

  a = NUM2INT(va); b = NUM2INT(vb); c = NUM2INT(vc);
  d = a + b + c;  
  r = INT2FIX(d);

  return r;
}

void Init_Unyo(void){
  VALUE rb_cHoge;

  rb_cHoge = rb_define_class("Hoge", rb_cObject);

  rb_define_method(rb_cHoge, "gunyo", gunyo, 3);
}
