use std::fmt;
use std::hash::Hash;
use std::marker::PhantomData;

use indexmap::IndexMap;
use serde::de::{Error as _, MapAccess, Visitor};
use serde::{Deserialize, Deserializer};

pub fn deserialize<'de, D, K>(deserializer: D) -> Result<IndexMap<K, u32>, D::Error>
where
    D: Deserializer<'de>,
    K: Deserialize<'de> + Eq + Hash + fmt::Display,
{
    struct CardCountsVisitor<K>(PhantomData<K>);

    impl<'de, K> Visitor<'de> for CardCountsVisitor<K>
    where
        K: Deserialize<'de> + Eq + Hash + fmt::Display,
    {
        type Value = IndexMap<K, u32>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a map from card UUIDs to copy counts")
        }

        fn visit_map<A>(self, mut access: A) -> Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut result = IndexMap::with_capacity(access.size_hint().unwrap_or(0));
            while let Some((card_id, copies)) = access.next_entry()? {
                if result.contains_key(&card_id) {
                    return Err(A::Error::custom(format_args!(
                        "duplicate card UUID {card_id}"
                    )));
                }
                result.insert(card_id, copies);
            }
            Ok(result)
        }
    }

    deserializer.deserialize_map(CardCountsVisitor(PhantomData))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_keys() {
        let error = ron::from_str::<DuplicateFixture>(r#"(cards: {"card-a": 1, "card-a": 2})"#)
            .unwrap_err();

        assert!(error.to_string().contains("duplicate card UUID card-a"));
    }

    #[derive(Debug, Deserialize)]
    struct DuplicateFixture {
        #[serde(deserialize_with = "deserialize")]
        #[allow(dead_code)]
        cards: IndexMap<String, u32>,
    }
}
