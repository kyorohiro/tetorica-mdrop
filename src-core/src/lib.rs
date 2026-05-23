pub mod bonjour;
pub mod hello;
pub mod http;
pub mod http_utils;
pub mod http_file;
pub mod http_api;

pub fn hello() -> &'static str {
    "Hello from mDrop core"
}
