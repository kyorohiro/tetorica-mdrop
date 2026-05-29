# README

This clone package is designed for distribution on itch.io and can be viewed directly in a web browser.

## Running Locally

If double-clicking index.html does not work, you can use one of the following methods.

### Method 1: Start a local web server

Using Python:

bash python3 -m http.server 

Then open your browser and access:

txt http://localhost:8000/ 

### Method 2: Open with Tetorica mDrop

You can also use Tetorica mDrop to preview this package.

1. Start Tetorica mDrop
2. Drag and drop this package into the application
3. Open and view the content

Tetorica mDrop:

https://kyorohiro.itch.io/tetorica-mdrop

## Why is a web server required?

Modern browsers restrict access to local files when using the file:// protocol.

This package uses browser features that require HTTP access. Running a local web server solves this limitation.