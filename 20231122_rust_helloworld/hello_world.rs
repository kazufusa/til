fn main() {
    let s = String::from("こんにちは、Rust");
    take_ownership(&s);
    println!("{}", s);
}

fn take_ownership(some_string: &String) {
    println!("{}", some_string);
}
