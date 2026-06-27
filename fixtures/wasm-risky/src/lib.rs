use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn process_input(input: &str) -> String {
    // No input validation
    let result = format!("Processed: {}", input);
    result
}

#[wasm_bindgen]
pub fn execute_code(code: &str) -> JsValue {
    // Unsafe eval equivalent
    eval(code)
}
