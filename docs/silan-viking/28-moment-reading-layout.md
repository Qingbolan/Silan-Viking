# Moment reading layout

## Reading and navigation

Moment detail pages reuse the Blog hero breadcrumb: Home → Moments → current
record. The shared breadcrumb owns the links, separator and current-page state;
Blog keeps its centered placement and Moments use a left-aligned reading header.

All screen sizes use one centered reading column: article, then discussion,
then adjacent records. A horizontal rule separates the article and discussion;
there is no visible Comments heading.
The rail scrolls with the page. Once the reader scrolls down and the rail is
no longer fully visible, a fixed bottom bar provides Previous, Back to top, and
Next links. Returning to the top hides the bar; short pages need no extra bar.
Reserved bottom spacing prevents it from covering the final paragraph.

Text remains at a comfortable reading width. A video stays above its title and
body, preserving automatic playback with sound and native playback controls.

The rail displays Comments above Previous / next, separated by a horizontal
rule. Both sections are visible by default without tab switching.
The comments panel reuses Blog LikePanel, ArticleLikerStrip and the default
CompactComments presentation through EntityDiscussion. The input precedes the
comment list and the panel follows content height. Moment API adapters retain
the identity of the current moment; Blog and Moment engagement data stay separate.
Failed submissions retain the draft for retry.

Adjacent records follow newest-first date order with stable API order within a
day. The beginning/end of the timeline has no fabricated looping link. Previews
show date, title, excerpt, and a video poster when available. Loading, failure
with retry, and missing-neighbor states are explicit. The timeline is fetched
once per language while moving between detail routes.

On narrow screens, the rail follows the article. Sections have accessible headings. Switching records resets the discussion to the newly selected item.

## Verification

`npm run test:moment-navigation`, `npm run test:media`, `npm run lint`, and
`npm run build` cover ordering, media projection and build validity. Browser
checks cover a same-day next-record link, the video detail layout, keyboard tab
switching, and a 390 px viewport without horizontal overflow.

## Continue reading gesture

There is no visible Previous / next section heading. Individual previews retain
their direction labels. MomentScrollTransition owns idle → pulling → leaving
gesture state. After scrolling settles at the page bottom, another downward
wheel gesture or upward touch swipe pulls the content with resistance. Releasing
below the threshold springs back; releasing above it navigates once to the next
moment and resets the scroll position. At the top, an upward wheel gesture or downward touch swipe uses the same
state machine to reveal the previous record’s date, title and excerpt before
switching. Missing neighbors disable only their corresponding direction.
Controls and editable fields are excluded. Reduced-motion preferences disable
movement. Gesture listeners and timers are removed when the record changes.

The static footer shows only the next record. Previous-record previews are
revealed by the upward gesture at the top, without a duplicate footer row.
