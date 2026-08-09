# Translator Descriptions

## Contents

- [Purpose](#purpose)
- [Comment scope](#comment-scope)
- [Description recipe](#description-recipe)
- [Documenting variables](#documenting-variables)
- [Ambiguity checklist](#ambiguity-checklist)
- [Examples](#examples)
- [Description review](#description-review)

## Purpose

A translator description supplies information that is visible to the product
team but absent from the source string. Its job is to let a translator produce
the right experience without inspecting code, guessing game mechanics, or
copying English grammar.

Describe semantics, not implementation. “Primary action after a completed
Journey; starts a separate run” is useful. “Text from
`JourneyCompleteScreen.tsx`” is volatile and does not explain the action.

Descriptions are especially important for:

- short or polysemous words such as “Open,” “Free,” “Draw,” or “Void”;
- commands whose subject is implicit;
- status text whose tense or actor is implicit;
- variables, selectors, counts, pronouns, and agreement;
- text attached to icons, images, or accessibility-only controls;
- invented world terms and familiar words with special game meanings;
- identical English text used for different meanings;
- genuine space or formatting constraints.

## Comment scope

For source-extracted gettext, use a `TRANSLATORS:` source comment immediately
before the literal `gettext`, `pgettext`, `ngettext`, or `npgettext` call. GNU
`xgettext` copies these comments into the POT. Inspect the generated entry to
confirm that the comment stayed attached to the intended message.

For Fluent, use `#` immediately above a message or term when its context is
unique. Use a `##` group comment only when every message below shares the stated
context. Use `###` for information that applies to the resource as a whole.

Do not make a translator search several screens away for the operative
description. Repeat a short fact when needed to make an individual translation
unit self-contained.

One strong comment is better than several low-information comments. Omit facts
that the source text states unambiguously unless they resolve a likely
translation question.

## Description recipe

Write one to three concise sentences covering the applicable fields:

1. **Placement and role.** Name the player-facing surface, moment, and UI role.
   Prefer “Primary action on the Journey completion summary” over a component
   filename.
2. **Meaning and consequence.** Explain what is true or what activating the
   control does. Define any game-specific use of an ordinary word.
3. **Participants and relationships.** Identify who performs the action, who
   receives it, and what pronouns or possessives refer to.
4. **Time, mood, and tone.** Say whether copy is a command, completed event,
   ongoing status, warning, question, playful narration, or neutral label when
   this is not obvious.
5. **Variables and variants.** Document every variable and selector input.
6. **Constraints.** State a real character, line, markup, or accessibility
   constraint. Describe the available space qualitatively when there is no
   tested hard limit.

Prefer direct statements:

- “The player has already won these battles.”
- “`$count` is the number of cards currently in the deck; it can be zero.”
- “Use the canonical term for Dreamsign from the glossary.”
- “Compact label beneath a large, separately rendered number.”

Avoid empty or harmful statements:

- “Translate naturally.”
- “Button label.”
- “This means New Journey.”
- “Keep this short.” when no relevant layout constraint was checked.
- “Keep the word ‘the’ before the noun.”
- “Do not change capitalization.” unless capitalization is a technical token.
- “Shown in `Foo.tsx`.” as the only context.

## Documenting variables

For every variable, state:

- its semantic meaning;
- its data shape: number, player-entered name, canonical card name, duration,
  enumerated state, and so on;
- its range or allowed values when bounded;
- whether zero, negative, fractional, or missing values can occur;
- whether the value is already localized or is a raw identifier;
- which noun, actor, or clause it controls;
- one realistic expanded example when the relationship is not obvious.

Do not describe `$count` as merely “the count.” Say what is counted and at what
moment. Do not assume one means singular in every locale. The selector applies
the locale's plural rules.

For enumerated selectors, explain the meaning of every value. A translator
should not have to infer whether `won` means the player won, the opponent won,
or a reward was won.

For names, identify whose name it is and whether it may be user-provided. This
alerts translators to unknown gender, declension limits, unsafe assumptions,
and unusual length.

## Ambiguity checklist

Before accepting a description, ask:

- Is a short English word being used as a noun, verb, adjective, or game term?
- Is an implied subject “you,” the player avatar, an opponent, a card, or the
  system?
- Has the action happened already, is it happening, or will the button cause
  it?
- Does “your” refer to one player, both cooperative players, or a character?
- Does “they” refer to a person, a card, or a plural group?
- Is a variable a count, ordinal, resource amount, name, title, or raw ID?
- Can the value be zero? Does zero need special product copy?
- Is a noun acting as a title, generic object, proper name, or keyword?
- Does the copy describe an icon visually or communicate the icon's function?
- Could identical English copy require different translations elsewhere?
- Is an apparent length requirement real, measured, and unavoidable?
- Would a translator know which glossary entry to use?

If any answer is unclear, resolve it before authoring the message.

## Examples

### Action label

Weak:

```ftl
# New Journey button.
journey-complete-new-journey = New { -journey }
```

Strong:

```ftl
# Primary action on the Journey completion summary. Starts a fresh run after
# the current run has ended; “Journey” is the canonical game mode.
journey-complete-new-journey = New { -journey }
```

The strong version distinguishes the action from renaming, restoring, or
continuing a journey and explains why the shared term matters.

### Count beside a separate numeral

Weak:

```ftl
# Number of battles.
journey-complete-stat-battles =
    { $count ->
        [one] { -battle(number: "one") } Won
       *[other] { -battle(number: "other") } Won
    }
```

Strong:

```ftl
# Label beneath a separately rendered number on the completion summary. The
# player has already won these battles. $count is the completed run's total
# wins and controls grammar; the numeral itself is not part of this message.
journey-complete-stat-battles =
    { $count ->
        [one] { -battle(number: "one") } Won
       *[other] { -battle(number: "other") } Won
    }
```

The strong version establishes tense, actor, layout relationship, and why the
variable is used even though it is not printed.

### Ambiguous control

Weak:

```ftl
# Open button.
deck-open = Open
```

Strong:

```ftl
# Command that reveals the player's deck browser. “Open” is an action, not the
# state of an already open panel. Compact control beside the deck summary.
deck-open = Open
```

If another surface uses “Open” to mean an unresolved choice remains available,
give it a separate message ID and description.

### Variable participants

Weak:

```ftl
# Shows damage.
battle-damage = { $source } deals { $amount } damage to { $target }.
```

Strong:

```ftl
# Past-tense battle log entry. $source is the displayed name of the character
# or effect dealing damage; $target is the displayed recipient name; $amount
# is a non-negative integer damage value. Names may not reveal grammatical
# gender.
battle-damage = { $source } deals { $amount } damage to { $target }.
```

The description exposes the actor/object relationship and prevents assumptions
about the inserted names.

### Canonical term

Weak:

```ftl
# Dreamsign.
-dreamsign = Dreamsign
```

Strong:

```ftl
# Canonical name for a collectible modifier that changes a Journey's rules.
# Treat as Dreamtides terminology and use consistently across screens.
-dreamsign = Dreamsign
```

The term description defines the concept instead of echoing its spelling.

### Accessibility-only label

Weak:

```ftl
# Icon label.
deck-close = Close
```

Strong:

```ftl
# Accessible name for the icon-only control that dismisses the deck browser
# and returns focus to the underlying Journey screen.
deck-close = Close deck browser
```

Describe function rather than the icon's appearance unless appearance itself
is the content.

## Description review

Review comments separately from source values. For each unit, hide the English
value mentally and ask whether the comment still identifies:

- the intended player experience;
- any specialized world meaning;
- actors, objects, time, and tone;
- every variable and selector;
- real presentation or accessibility constraints.

Then compare the comment to the implementation. Reject descriptions that are
polished but false, obsolete, or broader than the actual behavior. Keep
descriptions stable by referring to player-facing concepts rather than file
names and internal component structure.
