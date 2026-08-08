use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Context, Result, bail};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignDefinition {
    pub name: String,
    pub id: DreamsignId,
    pub ability_text: Vec<String>,
    pub art: DreamsignArt,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignArt {
    pub image: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignMetadataCatalog {
    pub dreamsigns: IndexMap<DreamsignId, DreamsignMetadata>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignMetadata {
    /// `None` preserves a missing compatibility field; an empty list preserves an explicit empty field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tides: Option<Vec<String>>,
    pub tags: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DreamsignId(Uuid);

impl DreamsignId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Dreamsign identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err(
                "Dreamsign identifier must use lowercase hyphenated UUID formatting".into(),
            );
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for DreamsignId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for DreamsignId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for DreamsignId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

pub fn lower(
    definitions: Vec<DreamsignDefinition>,
    mut metadata: DreamsignMetadataCatalog,
) -> Result<toml::Value> {
    validate_definitions(&definitions)?;
    validate_metadata(&metadata)?;

    let mut output = Vec::with_capacity(definitions.len());
    for definition in definitions {
        let internal = metadata
            .dreamsigns
            .shift_remove(&definition.id)
            .with_context(|| {
                format!("missing internal metadata for Dreamsign {}", definition.id)
            })?;

        let mut record = toml::map::Map::new();
        record.insert("id".into(), definition.id.to_string().into());
        record.insert("name".into(), definition.name.into());
        record.insert("image_name".into(), definition.art.image.into());
        if let Some(tides) = internal.tides {
            record.insert(
                "tides".into(),
                toml::Value::Array(tides.into_iter().map(Into::into).collect()),
            );
        }
        record.insert(
            "rendered-text".into(),
            definition.ability_text.join("\n\n").into(),
        );
        record.insert(
            "tags".into(),
            toml::Value::Array(internal.tags.into_iter().map(Into::into).collect()),
        );
        output.push(toml::Value::Table(record));
    }

    if let Some(id) = metadata.dreamsigns.keys().next() {
        bail!("internal metadata references unknown Dreamsign {id}");
    }

    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "dreamsign".into(),
        toml::Value::Array(output),
    )])))
}

fn validate_definitions(definitions: &[DreamsignDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for definition in definitions {
        if !ids.insert(definition.id) {
            bail!("duplicate Dreamsign id: {}", definition.id);
        }
        for (field, value) in [
            ("name", &definition.name),
            ("art.image", &definition.art.image),
        ] {
            if value.trim().is_empty() {
                bail!("Dreamsign {} has an empty {field}", definition.id);
            }
        }
        for (index, ability) in definition.ability_text.iter().enumerate() {
            if ability.trim().is_empty() {
                bail!(
                    "Dreamsign {} ability_text[{index}] must be non-empty",
                    definition.id
                );
            }
        }
    }
    Ok(())
}

fn validate_metadata(metadata: &DreamsignMetadataCatalog) -> Result<()> {
    for (id, entry) in &metadata.dreamsigns {
        if let Some(tides) = &entry.tides {
            validate_labels(*id, "tides", tides)?;
        }
        validate_labels(*id, "tags", &entry.tags)?;
    }
    Ok(())
}

fn validate_labels(id: DreamsignId, field: &str, values: &[String]) -> Result<()> {
    let mut unique = BTreeSet::new();
    for value in values {
        if value.trim().is_empty() {
            bail!("internal metadata for Dreamsign {id} has an empty {field} value");
        }
        if !unique.insert(value) {
            bail!("internal metadata for Dreamsign {id} repeats {field} value {value:?}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::models::compat::CompatDocument;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";

    fn synthetic_definitions() -> &'static str {
        r##"#![enable(implicit_some)]
[
  DreamsignDefinition(
    name: "Límbø Sign",
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: ["First paragraph with ✦.", "Second paragraph."],
    art: (image: "first.png"),
  ),
  DreamsignDefinition(
    name: "Blank Sign",
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: [],
    art: (image: "blank.png"),
  ),
]
"##
    }

    fn synthetic_metadata() -> &'static str {
        r##"#![enable(implicit_some)]
(
  dreamsigns: {
    "00000000-0000-4000-8000-000000000001": (
      tides: ["first_tide", "second_tide"],
      tags: ["first", "second"],
    ),
    "00000000-0000-4000-8000-000000000002": (tags: []),
  },
)
"##
    }

    fn fixture() -> (Vec<DreamsignDefinition>, DreamsignMetadataCatalog) {
        (
            ron::from_str(synthetic_definitions()).unwrap(),
            ron::from_str(synthetic_metadata()).unwrap(),
        )
    }

    #[test]
    fn lowers_ordered_definitions_abilities_and_internal_metadata() {
        let (definitions, metadata) = fixture();
        let output = lower(definitions, metadata).unwrap();
        let records = output["dreamsign"].as_array().unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(records[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            records[0]["rendered-text"].as_str(),
            Some("First paragraph with ✦.\n\nSecond paragraph.")
        );
        assert_eq!(records[1]["rendered-text"].as_str(), Some(""));
        assert_eq!(records[0]["tides"][1].as_str(), Some("second_tide"));
        assert!(records[1].get("tides").is_none());
        assert_eq!(records[1]["tags"].as_array().unwrap().len(), 0);
        assert_eq!(
            records[0].as_table().unwrap().keys().collect::<Vec<_>>(),
            vec!["id", "name", "image_name", "tides", "rendered-text", "tags"]
        );
    }

    #[test]
    fn preserves_an_explicit_empty_tides_field() {
        let (definitions, mut metadata) = fixture();
        metadata
            .dreamsigns
            .get_mut(&definitions[1].id)
            .unwrap()
            .tides = Some(vec![]);
        let output = lower(definitions, metadata).unwrap();
        assert_eq!(output["dreamsign"][1]["tides"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_ids() {
        let unknown = synthetic_definitions().replace(
            "name: \"Límbø Sign\",",
            "name: \"Límbø Sign\", surprise: true,",
        );
        assert!(ron::from_str::<Vec<DreamsignDefinition>>(&unknown).is_err());
        let unknown_metadata = synthetic_metadata().replace(
            "tags: [\"first\", \"second\"],",
            "tags: [\"first\", \"second\"], surprise: true,",
        );
        assert!(ron::from_str::<DreamsignMetadataCatalog>(&unknown_metadata).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<DreamsignId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_ids_missing_or_unknown_metadata_and_invalid_labels() {
        let (mut definitions, metadata) = fixture();
        definitions[1].id = definitions[0].id;
        assert!(
            lower(definitions, metadata.clone())
                .unwrap_err()
                .to_string()
                .contains("duplicate Dreamsign id")
        );

        let (definitions, mut missing) = fixture();
        missing.dreamsigns.shift_remove(&definitions[0].id);
        assert!(
            lower(definitions, missing)
                .unwrap_err()
                .to_string()
                .contains("missing internal metadata")
        );

        let (mut definitions, metadata) = fixture();
        definitions.truncate(1);
        assert!(
            lower(definitions, metadata)
                .unwrap_err()
                .to_string()
                .contains("references unknown Dreamsign")
        );

        let (definitions, mut metadata) = fixture();
        metadata
            .dreamsigns
            .get_mut(&definitions[0].id)
            .unwrap()
            .tags = vec!["duplicate".into(), "duplicate".into()];
        assert!(
            lower(definitions, metadata)
                .unwrap_err()
                .to_string()
                .contains("repeats tags value")
        );
    }

    #[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
    #[serde(deny_unknown_fields)]
    struct LegacyCatalog {
        dreamsign: Vec<LegacyDreamsign>,
    }

    #[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
    #[serde(deny_unknown_fields)]
    struct LegacyDreamsign {
        id: String,
        name: String,
        image_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tides: Option<Vec<String>>,
        #[serde(rename = "rendered-text")]
        rendered_text: String,
        tags: Vec<String>,
    }

    const LEGACY_IDENTITY_MAP: &[(&str, &str)] = &[
        (
            "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
            "c706d0ba-2f41-4b14-95d8-db168ac6246c",
        ),
        (
            "278EC1AB-F532-4862-84AE-63DF5E49548C",
            "278ec1ab-f532-4862-84ae-63df5e49548c",
        ),
        (
            "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
            "6e20e6c7-295a-48b1-b252-b8b00d6902c9",
        ),
        (
            "49990864-1DB0-4C08-91AE-40A1F04223E4",
            "49990864-1db0-4c08-91ae-40a1f04223e4",
        ),
        (
            "3DD05E97-1AF8-4AE9-8E1F-954EAA63E112",
            "3dd05e97-1af8-4ae9-8e1f-954eaa63e112",
        ),
        (
            "A42C99B2-F480-4F63-91A0-BD556120427D",
            "a42c99b2-f480-4f63-91a0-bd556120427d",
        ),
        (
            "3FD8861D-FC4C-4097-9E28-89CC37F5B3F4",
            "3fd8861d-fc4c-4097-9e28-89cc37f5b3f4",
        ),
        (
            "8778BF17-4E0A-4CE7-B23C-4DAF49A782A7",
            "8778bf17-4e0a-4ce7-b23c-4daf49a782a7",
        ),
        (
            "12EC9625-CBFB-4056-9C3E-98ED8C8BEA70",
            "12ec9625-cbfb-4056-9c3e-98ed8c8bea70",
        ),
        (
            "95F0F483-9A76-47C6-A839-01A1D9122945",
            "95f0f483-9a76-47c6-a839-01a1d9122945",
        ),
        (
            "553D2317-32F9-47BC-BAE0-5018CA26D56A",
            "553d2317-32f9-47bc-bae0-5018ca26d56a",
        ),
        (
            "0D668E16-1729-4289-AD1D-0FB3C1374EE9",
            "0d668e16-1729-4289-ad1d-0fb3c1374ee9",
        ),
        (
            "EDE46F71-AA77-4B12-9824-0D3706DA6A22",
            "ede46f71-aa77-4b12-9824-0d3706da6a22",
        ),
        (
            "3380C657-79CA-400B-ABB7-4B56FBB92AF4",
            "3380c657-79ca-400b-abb7-4b56fbb92af4",
        ),
        (
            "2EBF0BBB-440C-4DBA-8E48-228DAADC0A1E",
            "2ebf0bbb-440c-4dba-8e48-228daadc0a1e",
        ),
        (
            "2D4EB3EE-0931-45ED-8365-69F18096EAD5",
            "2d4eb3ee-0931-45ed-8365-69f18096ead5",
        ),
        (
            "A98F468B-5E76-4041-83EE-69C0871A6BF0",
            "a98f468b-5e76-4041-83ee-69c0871a6bf0",
        ),
        (
            "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5",
            "d1fdbe21-56f6-43c0-aaac-1e4683964da5",
        ),
        (
            "D76684C3-797E-44AE-A2BA-333E77D46A4D",
            "d76684c3-797e-44ae-a2ba-333e77d46a4d",
        ),
        (
            "00CC7E7F-4245-4447-B9DC-F647DC6241A2",
            "00cc7e7f-4245-4447-b9dc-f647dc6241a2",
        ),
        (
            "47081BDE-F35D-4B5C-BA17-53E5DBF5B419",
            "47081bde-f35d-4b5c-ba17-53e5dbf5b419",
        ),
        (
            "3ED05D9A-DAE0-4260-9B99-AD22D02FC583",
            "3ed05d9a-dae0-4260-9b99-ad22d02fc583",
        ),
        (
            "9F34B5F6-4766-4A7E-A841-D7B945CAD504",
            "9f34b5f6-4766-4a7e-a841-d7b945cad504",
        ),
        (
            "94E5683D-A24C-4F89-8AFA-652D7C6C79AA",
            "94e5683d-a24c-4f89-8afa-652d7c6c79aa",
        ),
        (
            "4409A691-49B4-4FB0-82F6-4F45AE86D8C2",
            "4409a691-49b4-4fb0-82f6-4f45ae86d8c2",
        ),
        (
            "1DFA4D90-8270-4B7C-87BE-D95AB6201E00",
            "1dfa4d90-8270-4b7c-87be-d95ab6201e00",
        ),
        (
            "DBBADE86-9FB6-4283-B2DC-9C1EF66FD531",
            "dbbade86-9fb6-4283-b2dc-9c1ef66fd531",
        ),
        (
            "21AE8473-AFA7-4384-B7D4-AFBF1D84E691",
            "21ae8473-afa7-4384-b7d4-afbf1d84e691",
        ),
        (
            "6B5C0F18-198C-44E7-92E8-D639298B8CF6",
            "6b5c0f18-198c-44e7-92e8-d639298b8cf6",
        ),
        (
            "246AC924-74DD-4387-9FD6-5BC8E563907A",
            "246ac924-74dd-4387-9fd6-5bc8e563907a",
        ),
        (
            "1ECE0E16-08DE-4C99-8552-2D1D3A2BD517",
            "1ece0e16-08de-4c99-8552-2d1d3a2bd517",
        ),
        (
            "3D86F8CE-42AC-43DC-96D5-121E6D1A6167",
            "3d86f8ce-42ac-43dc-96d5-121e6d1a6167",
        ),
        (
            "DEC81FA2-7865-448C-95BC-622B884CEA9E",
            "dec81fa2-7865-448c-95bc-622b884cea9e",
        ),
        (
            "4DC47625-73BD-4518-A4EF-29DDA2171594",
            "4dc47625-73bd-4518-a4ef-29dda2171594",
        ),
        (
            "4A91C56C-D828-482A-A46C-1299D69FA011",
            "4a91c56c-d828-482a-a46c-1299d69fa011",
        ),
        (
            "26786698-FDF2-493D-905B-4273A20586C9",
            "26786698-fdf2-493d-905b-4273a20586c9",
        ),
        (
            "B7F8A4EA-C067-47ED-B251-2876B609108C",
            "b7f8a4ea-c067-47ed-b251-2876b609108c",
        ),
        (
            "253A106D-F64E-4A60-9471-446A18EE8959",
            "253a106d-f64e-4a60-9471-446a18ee8959",
        ),
        (
            "5A22F358-BC84-44B1-A201-5F9F57940C51",
            "5a22f358-bc84-44b1-a201-5f9f57940c51",
        ),
        (
            "6B95D6BD-C970-4465-9536-4F21E7630D0A",
            "6b95d6bd-c970-4465-9536-4f21e7630d0a",
        ),
        (
            "1A524712-EF7E-43D9-BD79-5DEA5250BF08",
            "1a524712-ef7e-43d9-bd79-5dea5250bf08",
        ),
        (
            "6F4E2D9F-38A4-4F6A-8FDE-7D942977A6DF",
            "6f4e2d9f-38a4-4f6a-8fde-7d942977a6df",
        ),
        (
            "C75CD943-5E8B-4A56-8C09-D975571570D4",
            "c75cd943-5e8b-4a56-8c09-d975571570d4",
        ),
        (
            "7EC00DA2-2B2D-4613-9A2A-8611D38199CA",
            "7ec00da2-2b2d-4613-9a2a-8611d38199ca",
        ),
        (
            "064CFB53-FCB4-4471-80DE-27ECCD23D3C0",
            "064cfb53-fcb4-4471-80de-27eccd23d3c0",
        ),
        (
            "A7CDC8FD-5827-4D73-AE0C-AA594A69FA8A",
            "a7cdc8fd-5827-4d73-ae0c-aa594a69fa8a",
        ),
        (
            "BFEC4F5D-9B0D-4ED2-B470-DB73D852448F",
            "bfec4f5d-9b0d-4ed2-b470-db73d852448f",
        ),
        (
            "FB7316C9-EF29-42FD-993E-D3337CB06921",
            "fb7316c9-ef29-42fd-993e-d3337cb06921",
        ),
        (
            "257C160F-7D70-4EBD-BB0F-F83E61907310",
            "257c160f-7d70-4ebd-bb0f-f83e61907310",
        ),
        (
            "49F216A2-0596-4124-BB40-60AC9AFE6E0B",
            "49f216a2-0596-4124-bb40-60ac9afe6e0b",
        ),
        (
            "56523397-6C48-4DF6-846B-9E4F15D7FDEE",
            "56523397-6c48-4df6-846b-9e4f15d7fdee",
        ),
        (
            "6DAC6BFF-AF3A-4749-8547-01FDED1C81C9",
            "6dac6bff-af3a-4749-8547-01fded1c81c9",
        ),
        (
            "396DA354-9F4D-4AE7-A9DC-02D1330A2678",
            "396da354-9f4d-4ae7-a9dc-02d1330a2678",
        ),
        (
            "A09F60DF-EC9F-4608-873C-1372AF18DAA2",
            "a09f60df-ec9f-4608-873c-1372af18daa2",
        ),
        (
            "044F856B-C08B-4B82-81E3-5417962BF868",
            "044f856b-c08b-4b82-81e3-5417962bf868",
        ),
        (
            "B6333EBA-5573-441C-B286-1CD7F7CB6916",
            "b6333eba-5573-441c-b286-1cd7f7cb6916",
        ),
        (
            "B2626645-827C-46EC-8204-017862D1A398",
            "b2626645-827c-46ec-8204-017862d1a398",
        ),
        (
            "2059AA74-8897-4C76-833F-DDEF7D34346C",
            "2059aa74-8897-4c76-833f-ddef7d34346c",
        ),
        (
            "8340CCE5-8E27-4940-AB79-34E09FDBCAE1",
            "8340cce5-8e27-4940-ab79-34e09fdbcae1",
        ),
        (
            "2CBCBEBB-FB79-4833-A770-2216873147C4",
            "2cbcbebb-fb79-4833-a770-2216873147c4",
        ),
        (
            "D2A916C1-321A-4AE3-9A50-0B7F13C5EFF6",
            "d2a916c1-321a-4ae3-9a50-0b7f13c5eff6",
        ),
        (
            "10F27800-99F8-4504-9D94-26BCB3C32788",
            "10f27800-99f8-4504-9d94-26bcb3c32788",
        ),
        (
            "946DBB36-0A90-495A-BF0F-17351C93D74B",
            "946dbb36-0a90-495a-bf0f-17351c93d74b",
        ),
        (
            "89C83D7E-5617-49B4-B6CD-214680FE0627",
            "89c83d7e-5617-49b4-b6cd-214680fe0627",
        ),
        (
            "8B87B0C7-E7D5-4C53-B99B-B1E2407CB519",
            "8b87b0c7-e7d5-4c53-b99b-b1e2407cb519",
        ),
        (
            "73EFD845-6009-4686-860C-01C7F5B1C074",
            "73efd845-6009-4686-860c-01c7f5b1c074",
        ),
        (
            "ADC23870-55F8-4F23-B973-A358FC257414",
            "adc23870-55f8-4f23-b973-a358fc257414",
        ),
        (
            "1A21186C-CAFD-4E0F-9304-1AC0EF55340A",
            "1a21186c-cafd-4e0f-9304-1ac0ef55340a",
        ),
        (
            "FF8D8D4A-FE7B-4511-8192-E6E2E7712DAF",
            "ff8d8d4a-fe7b-4511-8192-e6e2e7712daf",
        ),
        (
            "A92D2B95-C63D-4C1C-831B-902C44DEEE57",
            "a92d2b95-c63d-4c1c-831b-902c44deee57",
        ),
        (
            "39260DD5-CB43-47D5-A007-EFFBE13D6417",
            "39260dd5-cb43-47d5-a007-effbe13d6417",
        ),
        (
            "4E51F321-9089-4872-A0E2-AB909E242B33",
            "4e51f321-9089-4872-a0e2-ab909e242b33",
        ),
        (
            "268341C7-BB5B-49FB-AD8D-A792B7D631A0",
            "268341c7-bb5b-49fb-ad8d-a792b7d631a0",
        ),
        (
            "9AAED05A-2223-42F2-9B9D-81A53EAB811C",
            "9aaed05a-2223-42f2-9b9d-81a53eab811c",
        ),
        (
            "5190A8B8-25A0-4C60-A4DE-2E2C5A73AF77",
            "5190a8b8-25a0-4c60-a4de-2e2c5a73af77",
        ),
        (
            "86F64A29-7338-4759-81DA-4C7656E543D2",
            "86f64a29-7338-4759-81da-4c7656e543d2",
        ),
        (
            "9D134DFC-4643-47F3-A7EC-EA770587CEA1",
            "9d134dfc-4643-47f3-a7ec-ea770587cea1",
        ),
        (
            "3A22A33F-5682-4D00-B0EC-86E43B6ED9DF",
            "3a22a33f-5682-4d00-b0ec-86e43b6ed9df",
        ),
        (
            "B3403800-7004-4775-915B-A19840E416B0",
            "b3403800-7004-4775-915b-a19840e416b0",
        ),
        (
            "989B55BD-139F-40DC-B1FD-EB2F7B1C091A",
            "989b55bd-139f-40dc-b1fd-eb2f7b1c091a",
        ),
        (
            "6103508C-4991-4B80-9DC1-F30122957296",
            "6103508c-4991-4b80-9dc1-f30122957296",
        ),
        (
            "7A37386D-6E7C-4F08-B07F-E92A1FD69893",
            "7a37386d-6e7c-4f08-b07f-e92a1fd69893",
        ),
        (
            "15FD5A22-A786-48E3-99B0-919E810B3EBA",
            "15fd5a22-a786-48e3-99b0-919e810b3eba",
        ),
        (
            "08A3983A-1B95-4D2E-A445-9D8DC2B8FCA7",
            "08a3983a-1b95-4d2e-a445-9d8dc2b8fca7",
        ),
        (
            "EB6A5C19-26A6-41EF-AC7A-CE1152557B5C",
            "eb6a5c19-26a6-41ef-ac7a-ce1152557b5c",
        ),
        (
            "87239E3F-04F7-45BD-9B73-944EF36AD445",
            "87239e3f-04f7-45bd-9b73-944ef36ad445",
        ),
        (
            "11018E32-F47E-45FD-A8CF-3A9E3F3BE71B",
            "11018e32-f47e-45fd-a8cf-3a9e3f3be71b",
        ),
        (
            "D4B18CC4-CAEB-40B3-B0E2-F1C8B1C8354C",
            "d4b18cc4-caeb-40b3-b0e2-f1c8b1c8354c",
        ),
        (
            "2788CDAD-2735-4CDF-89A8-DCECACA87369",
            "2788cdad-2735-4cdf-89a8-dcecaca87369",
        ),
        (
            "4F5BDCAC-64CB-4A45-8121-E37F5E4D3074",
            "4f5bdcac-64cb-4a45-8121-e37f5e4d3074",
        ),
        (
            "1CCD8D69-E14C-4788-BE1D-CB6A1B703225",
            "1ccd8d69-e14c-4788-be1d-cb6a1b703225",
        ),
        (
            "6B51E477-352C-489B-8D5F-049BC378FDE9",
            "6b51e477-352c-489b-8d5f-049bc378fde9",
        ),
        (
            "4D762FAE-AE9F-4C35-A03B-051D7ECC3532",
            "4d762fae-ae9f-4c35-a03b-051d7ecc3532",
        ),
        (
            "C92438FC-8E1F-4F97-9DCF-8CA0EDAA8607",
            "c92438fc-8e1f-4f97-9dcf-8ca0edaa8607",
        ),
        (
            "9DD7D53F-D4DB-4EEC-919D-D701774AF359",
            "9dd7d53f-d4db-4eec-919d-d701774af359",
        ),
        (
            "BB8BB233-7CB1-43B3-AF30-E71AB9E832C5",
            "bb8bb233-7cb1-43b3-af30-e71ab9e832c5",
        ),
        (
            "FDFBD522-C2BE-4B77-A63F-E9A64CA3DE3B",
            "fdfbd522-c2be-4b77-a63f-e9a64ca3de3b",
        ),
        (
            "293A610D-EA75-4974-88DA-13E4C86F248F",
            "293a610d-ea75-4974-88da-13e4c86f248f",
        ),
        (
            "4A9F95D5-B72D-4EE8-8D29-B05646EDC23D",
            "4a9f95d5-b72d-4ee8-8d29-b05646edc23d",
        ),
        (
            "B765F6BB-0B8A-4847-ADA4-477B9493E3AD",
            "b765f6bb-0b8a-4847-ada4-477b9493e3ad",
        ),
        (
            "72EF4B11-5366-4798-AAB0-09E5FFBB1ED8",
            "72ef4b11-5366-4798-aab0-09e5ffbb1ed8",
        ),
        (
            "05F69D01-F8A3-4044-B7CD-0BFD9ED980CD",
            "05f69d01-f8a3-4044-b7cd-0bfd9ed980cd",
        ),
        (
            "64A28F37-54A4-4152-8C72-2EBC61E19AAC",
            "64a28f37-54a4-4152-8c72-2ebc61e19aac",
        ),
        (
            "206049AE-9F28-4A90-9F75-63D9EE5F4A27",
            "206049ae-9f28-4a90-9f75-63d9ee5f4a27",
        ),
        (
            "9204FBC8-BA40-4E33-9FBC-F62CCC4A43D1",
            "9204fbc8-ba40-4e33-9fbc-f62ccc4a43d1",
        ),
        (
            "FB87262C-5BDE-409E-92F1-58CC7A4E5491",
            "fb87262c-5bde-409e-92f1-58cc7a4e5491",
        ),
        (
            "62E1A588-F719-415C-9434-80AA08CE2E6A",
            "62e1a588-f719-415c-9434-80aa08ce2e6a",
        ),
        (
            "4BB408A8-7941-42DC-9FF6-DBC1400C99ED",
            "4bb408a8-7941-42dc-9ff6-dbc1400c99ed",
        ),
        (
            "FDD2FFE4-40F4-49CF-BC2E-2496E1042F76",
            "fdd2ffe4-40f4-49cf-bc2e-2496e1042f76",
        ),
        (
            "56CAA78B-021D-4B27-ACAB-C77FB0146CED",
            "56caa78b-021d-4b27-acab-c77fb0146ced",
        ),
        (
            "EF25FBA0-58A0-4B69-BE06-3668679FCDC7",
            "ef25fba0-58a0-4b69-be06-3668679fcdc7",
        ),
        (
            "055F211D-AA51-49EB-9162-190A946B1614",
            "055f211d-aa51-49eb-9162-190a946b1614",
        ),
        (
            "CD4BB1F4-66BB-45EA-ABFE-CE0C66E4EC4F",
            "cd4bb1f4-66bb-45ea-abfe-ce0c66e4ec4f",
        ),
        (
            "1CF06F9B-D698-434B-8E36-8A47206F4C0C",
            "1cf06f9b-d698-434b-8e36-8a47206f4c0c",
        ),
        (
            "8408B8C2-5A3F-40DD-BAC4-98F2736C4176",
            "8408b8c2-5a3f-40dd-bac4-98f2736c4176",
        ),
        (
            "10BD78DE-87EC-44E4-9B16-E755DA2A9717",
            "10bd78de-87ec-44e4-9b16-e755da2a9717",
        ),
        (
            "8A2C7B32-26EA-40E2-845A-689DA5673B4D",
            "8a2c7b32-26ea-40e2-845a-689da5673b4d",
        ),
        (
            "883F88FB-AC50-419A-8382-C22EDEE29755",
            "883f88fb-ac50-419a-8382-c22edee29755",
        ),
        (
            "C2AF5460-E61F-409B-9B86-6AC7DB34D748",
            "c2af5460-e61f-409b-9b86-6ac7db34d748",
        ),
        (
            "E7D23BF7-4D60-4B43-94C4-14A06C0F9116",
            "e7d23bf7-4d60-4b43-94c4-14a06c0f9116",
        ),
        (
            "4F21A4AB-E4AA-4718-8563-9AFB72D140C0",
            "4f21a4ab-e4aa-4718-8563-9afb72d140c0",
        ),
        (
            "0C52E8C3-A792-4EEA-955F-A0C61463C066",
            "0c52e8c3-a792-4eea-955f-a0c61463c066",
        ),
        (
            "8B69DE8A-835D-4F0C-AC25-DC0E700E2983",
            "8b69de8a-835d-4f0c-ac25-dc0e700e2983",
        ),
        (
            "AB1DA9D3-376A-460A-A9DC-4737E59E558B",
            "ab1da9d3-376a-460a-a9dc-4737e59e558b",
        ),
        (
            "34CE9428-DDA9-4EFA-BACD-5EC2698561C1",
            "34ce9428-dda9-4efa-bacd-5ec2698561c1",
        ),
        (
            "D9F0F7FF-63C0-4247-8831-054D7FED931D",
            "d9f0f7ff-63c0-4247-8831-054d7fed931d",
        ),
        (
            "BE59C0BA-6286-49E3-A88D-86B0977CC30A",
            "be59c0ba-6286-49e3-a88d-86b0977cc30a",
        ),
        (
            "AF92858A-0C50-4ABF-A622-04C024CA32B3",
            "af92858a-0c50-4abf-a622-04c024ca32b3",
        ),
        (
            "488BF436-C6D5-4E38-8A19-E50041F53766",
            "488bf436-c6d5-4e38-8a19-e50041f53766",
        ),
        (
            "F4DF5A74-7822-4552-A3AB-F50B00758593",
            "f4df5a74-7822-4552-a3ab-f50b00758593",
        ),
        (
            "95A162C1-5FB0-4966-B631-EEC1E8EC96EF",
            "95a162c1-5fb0-4966-b631-eec1e8ec96ef",
        ),
        (
            "1C505034-E405-495D-8418-6E3C06D974F0",
            "1c505034-e405-495d-8418-6e3c06d974f0",
        ),
        (
            "427C71E3-178F-4352-8D6F-F0789CB13C2D",
            "427c71e3-178f-4352-8d6f-f0789cb13c2d",
        ),
        (
            "2DCF92BF-93B3-400C-AB97-69D3098F8868",
            "2dcf92bf-93b3-400c-ab97-69d3098f8868",
        ),
        (
            "E377C3ED-16F5-4424-A9F1-73F9750ACE9F",
            "e377c3ed-16f5-4424-a9f1-73f9750ace9f",
        ),
        (
            "71F77DD5-3BB5-4987-80F4-13DC69F74E6B",
            "71f77dd5-3bb5-4987-80f4-13dc69f74e6b",
        ),
        (
            "D78864DA-EB31-4F25-9D51-94FCA7ECF810",
            "d78864da-eb31-4f25-9d51-94fca7ecf810",
        ),
        (
            "1328E611-FA2F-426F-87E2-97F26C061866",
            "1328e611-fa2f-426f-87e2-97f26c061866",
        ),
        (
            "069C6E8F-4F41-4F13-9EC9-2009B4186E3B",
            "069c6e8f-4f41-4f13-9ec9-2009b4186e3b",
        ),
        (
            "8E2D26A8-FF39-48A4-A30E-434479C4675F",
            "8e2d26a8-ff39-48a4-a30e-434479c4675f",
        ),
        (
            "108841CE-4FEB-4C73-972E-0277C727C63E",
            "108841ce-4feb-4c73-972e-0277c727c63e",
        ),
        (
            "025CE7F1-066B-480A-8A2F-364379890ABD",
            "025ce7f1-066b-480a-8a2f-364379890abd",
        ),
        (
            "452B7CD6-9DC3-48A8-B9AA-412CA6DD5F19",
            "452b7cd6-9dc3-48a8-b9aa-412ca6dd5f19",
        ),
        (
            "DA7E4B45-9106-4116-BC1C-3AEC8885396B",
            "da7e4b45-9106-4116-bc1c-3aec8885396b",
        ),
        (
            "7E8C86CC-788F-4648-BE84-E0935C40C31E",
            "7e8c86cc-788f-4648-be84-e0935c40c31e",
        ),
        (
            "CD81A49D-DF58-4E0E-B1B2-33A82B386052",
            "cd81a49d-df58-4e0e-b1b2-33a82b386052",
        ),
        (
            "58472AD2-88B1-4DC7-A161-C6DEA7D8C43D",
            "58472ad2-88b1-4dc7-a161-c6dea7d8c43d",
        ),
        (
            "3C0CED1A-7A2A-4F18-9AB4-5D6055D1DC59",
            "3c0ced1a-7a2a-4f18-9ab4-5d6055d1dc59",
        ),
        (
            "0DF9D72C-58EA-42A0-A72A-CBC540A1836A",
            "0df9d72c-58ea-42a0-a72a-cbc540a1836a",
        ),
        (
            "31DF4C62-6AB2-47F2-A4FF-C32B8E554B3B",
            "31df4c62-6ab2-47f2-a4ff-c32b8e554b3b",
        ),
        (
            "EB55B141-82F8-4BA4-B319-420F762E9EE4",
            "eb55b141-82f8-4ba4-b319-420f762e9ee4",
        ),
        (
            "1CD25B9A-B176-4C51-8349-BB4DF35CBF05",
            "1cd25b9a-b176-4c51-8349-bb4df35cbf05",
        ),
        (
            "B8590328-CA72-4869-A795-C7F4B6802BED",
            "b8590328-ca72-4869-a795-c7f4b6802bed",
        ),
    ];

    #[test]
    #[ignore = "real-catalog parity probe for canonical Dreamsign review"]
    fn real_catalog_candidate_preserves_complete_compatibility_semantics() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let source_text = fs::read_to_string(root.join("data/dreamsigns.ron")).unwrap();
        let compatibility: CompatDocument = ron::from_str(&source_text).unwrap();
        let legacy: LegacyCatalog = compatibility.data.clone().try_into().unwrap();

        let generated_text = fs::read_to_string(root.join("data/dreamsigns.toml")).unwrap();
        let generated: LegacyCatalog = toml::from_str(&generated_text).unwrap();
        assert_eq!(legacy, generated);

        let candidate_text =
            fs::read_to_string(root.join("data/dreamsigns_canonical.ron")).unwrap();
        let definitions: Vec<DreamsignDefinition> = ron::from_str(&candidate_text).unwrap();
        let metadata_text =
            fs::read_to_string(root.join("data/internal/internal_dreamsign_metadata.ron")).unwrap();
        let metadata: DreamsignMetadataCatalog = ron::from_str(&metadata_text).unwrap();

        let identity_map: IndexMap<_, _> = LEGACY_IDENTITY_MAP.iter().copied().collect();
        assert_eq!(identity_map.len(), LEGACY_IDENTITY_MAP.len());
        assert_eq!(identity_map.len(), legacy.dreamsign.len());
        let mut normalized = legacy.clone();
        for record in &mut normalized.dreamsign {
            record.id = identity_map
                .get(record.id.as_str())
                .unwrap_or_else(|| panic!("missing legacy Dreamsign identity {}", record.id))
                .to_string();
        }
        let canonical_ids: BTreeSet<_> = definitions
            .iter()
            .map(|entry| entry.id.to_string())
            .collect();
        let mapped_ids: BTreeSet<_> = identity_map.values().map(ToString::to_string).collect();
        assert_eq!(mapped_ids, canonical_ids);
        assert_eq!(metadata.dreamsigns.len(), definitions.len());

        let mut lowered = lower(definitions, metadata).unwrap();
        let mut expected = toml::Value::try_from(normalized).unwrap();
        let lowered_records = lowered["dreamsign"].as_array_mut().unwrap();
        let expected_records = expected["dreamsign"].as_array_mut().unwrap();
        for (lowered_record, expected_record) in
            lowered_records.iter_mut().zip(expected_records.iter_mut())
        {
            let lowered_text = lowered_record["rendered-text"].as_str().unwrap();
            let expected_text = expected_record["rendered-text"].as_str().unwrap();
            assert_eq!(
                normalized_whitespace(lowered_text),
                normalized_whitespace(expected_text)
            );
            lowered_record
                .as_table_mut()
                .unwrap()
                .remove("rendered-text");
            expected_record
                .as_table_mut()
                .unwrap()
                .remove("rendered-text");
        }
        assert_eq!(lowered, expected);
    }

    fn normalized_whitespace(value: &str) -> String {
        value.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}
