fn main() {
    let icon_dir = std::path::Path::new("icons");
    let icon_path = icon_dir.join("icon.png");
    std::fs::create_dir_all(icon_dir).expect("create generated icon directory");
    let file = std::fs::File::create(icon_path).expect("create generated development icon");
    let mut encoder = png::Encoder::new(file, 32, 32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("write icon header");
    let mut pixels = Vec::with_capacity(32 * 32 * 4);
    for y in 0..32 {
        for x in 0..32 {
            let inside = (4..28).contains(&x) && (4..28).contains(&y);
            pixels.extend_from_slice(if inside {
                &[112, 86, 190, 255]
            } else {
                &[26, 22, 46, 255]
            });
        }
    }
    writer.write_image_data(&pixels).expect("write icon pixels");
    tauri_build::build()
}
