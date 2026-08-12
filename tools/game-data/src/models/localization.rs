use anyhow::{Result, bail};
use trox::{LocalizedString, Pattern};

pub fn source_text(value: &LocalizedString) -> Result<String> {
    if !value.arguments().is_empty() || !value.selectors().is_empty() {
        bail!("canonical game-data text must be a static Trox value");
    }
    let Pattern::Text { text } = &value.identity().pattern else {
        bail!("canonical game-data text must be a static Trox text pattern");
    };
    Ok(text.replace("{{", "{").replace("}}", "}"))
}

pub fn source_texts(values: Vec<LocalizedString>) -> Result<Vec<String>> {
    values.iter().map(source_text).collect()
}

pub fn joined_source_text(values: Vec<LocalizedString>, separator: &str) -> Result<String> {
    Ok(source_texts(values)?.join(separator))
}

pub fn localized_source(text: String) -> Result<LocalizedString> {
    let escaped = text.replace('{', "{{").replace('}', "}}");
    trox::tx_owned(escaped, None).map_err(Into::into)
}
