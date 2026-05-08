pub fn hello() -> &'static str{
    return "Hello, World!";
}


pub fn greet(name: &str) -> String {
    println!("> greet {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}