pub mod google_books;
pub mod openlibrary;

use serde::{Deserialize, Serialize};

/// Common metadata returned by any enrichment provider.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentData {
    pub title: String,
    pub author: String,
    pub description: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f64>,
    pub isbn: Option<String>,
    pub cover_url: Option<String>,
    pub language: Option<String>,
    pub publisher: Option<String>,
    pub publish_year: Option<u16>,
    /// Identifier for the source (e.g., "openlibrary", "google_books")
    pub source: String,
    /// Provider-specific key for this result
    pub source_key: Option<String>,
}

/// Per-provider configuration stored in the settings table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub enabled: bool,
    pub api_key: Option<String>,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            api_key: None,
        }
    }
}

/// Metadata about a provider (for UI display and registration).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub requires_api_key: bool,
    pub api_key_help: String,
    pub config: ProviderConfig,
}

/// Trait that all enrichment providers implement.
pub trait EnrichmentProvider: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn requires_api_key(&self) -> bool;
    fn api_key_help(&self) -> &str;
    fn search_by_isbn(&self, isbn: &str) -> Result<Vec<EnrichmentData>, String>;
    fn search_by_title(
        &self,
        title: &str,
        author: Option<&str>,
    ) -> Result<Vec<EnrichmentData>, String>;
    fn configure(&mut self, config: ProviderConfig);
    fn config(&self) -> &ProviderConfig;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enrichment_data_default() {
        let data = EnrichmentData::default();
        assert_eq!(data.title, "");
        assert_eq!(data.author, "");
        assert!(data.description.is_none());
        assert!(data.genres.is_empty());
        assert!(data.rating.is_none());
        assert!(data.isbn.is_none());
        assert!(data.cover_url.is_none());
        assert!(data.language.is_none());
        assert!(data.publisher.is_none());
        assert!(data.publish_year.is_none());
        assert_eq!(data.source, "");
        assert!(data.source_key.is_none());
    }

    #[test]
    fn provider_config_default() {
        let config = ProviderConfig::default();
        assert!(config.enabled);
        assert!(config.api_key.is_none());
    }
}
