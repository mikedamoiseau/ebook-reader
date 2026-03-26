use serde::Serialize;

/// Enriched metadata from OpenLibrary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLibraryResult {
    pub key: String,
    pub title: String,
    pub author: String,
    pub description: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f64>,
    pub isbn: Option<String>,
    pub cover_url: Option<String>,
}

/// Search OpenLibrary by title and optionally author.
/// Returns the top matches.
pub fn search(title: &str, author: Option<&str>) -> Result<Vec<OpenLibraryResult>, String> {
    let mut query = format!("title={}", urlencoding(title));
    if let Some(a) = author {
        if !a.is_empty() {
            query.push_str(&format!("&author={}", urlencoding(a)));
        }
    }
    let url = format!(
        "https://openlibrary.org/search.json?{}&limit=5&fields=key,title,author_name,first_sentence,subject,isbn,ratings_average,cover_i",
        query
    );

    let resp =
        reqwest::blocking::get(&url).map_err(|e| format!("OpenLibrary search failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("OpenLibrary HTTP {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().map_err(|e| format!("JSON parse error: {e}"))?;

    let docs = json["docs"]
        .as_array()
        .ok_or_else(|| "Unexpected response format".to_string())?;
    let mut results = Vec::new();

    for doc in docs {
        let key = doc["key"].as_str().unwrap_or("").to_string();
        let title = doc["title"].as_str().unwrap_or("").to_string();
        let author = doc["author_name"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let description = doc["first_sentence"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let genres: Vec<String> = doc["subject"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .take(10)
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();
        let rating = doc["ratings_average"].as_f64();
        let isbn = doc["isbn"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let cover_url = doc["cover_i"]
            .as_i64()
            .map(|id| format!("https://covers.openlibrary.org/b/id/{}-L.jpg", id));

        if !title.is_empty() {
            results.push(OpenLibraryResult {
                key,
                title,
                author,
                description,
                genres,
                rating,
                isbn,
                cover_url,
            });
        }
    }

    Ok(results)
}

/// Fetch detailed metadata for a specific OpenLibrary work.
pub fn get_work(key: &str) -> Result<OpenLibraryResult, String> {
    let url = format!("https://openlibrary.org{}.json", key);
    let resp =
        reqwest::blocking::get(&url).map_err(|e| format!("OpenLibrary fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("OpenLibrary HTTP {}", resp.status()));
    }
    let doc: serde_json::Value = resp.json().map_err(|e| format!("JSON parse error: {e}"))?;

    let title = doc["title"].as_str().unwrap_or("").to_string();
    let description = match &doc["description"] {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(o) => o
            .get("value")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    };
    let genres: Vec<String> = doc["subjects"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .take(10)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    let cover_url = doc["covers"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_i64())
        .map(|id| format!("https://covers.openlibrary.org/b/id/{}-L.jpg", id));

    Ok(OpenLibraryResult {
        key: key.to_string(),
        title,
        author: String::new(), // work endpoint doesn't include author directly
        description,
        genres,
        rating: None,
        isbn: None,
        cover_url,
    })
}

fn urlencoding(s: &str) -> String {
    s.replace(' ', "+")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoding_spaces_replaced() {
        assert_eq!(urlencoding("hello world"), "hello+world");
    }

    #[test]
    fn urlencoding_special_chars() {
        assert_eq!(urlencoding("a&b=c#d"), "a%26b%3Dc%23d");
    }

    #[test]
    fn urlencoding_empty_string() {
        assert_eq!(urlencoding(""), "");
    }

    #[test]
    fn urlencoding_no_special_chars() {
        assert_eq!(urlencoding("simple"), "simple");
    }

    #[test]
    fn urlencoding_multiple_spaces() {
        assert_eq!(urlencoding("the great gatsby"), "the+great+gatsby");
    }
}
