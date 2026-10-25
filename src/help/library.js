/**
 * The built-in help library: sections, each with pages written in the same
 * light markdown as site pages. The platform admin can edit it in Help;
 * their copy is kept on the server (or in this browser, locally) and
 * replaces this one. Shortcodes for diagrams:
 *
 *   [[diagram:lenses]]       how the five systems lenses line up
 *   [[diagram:lens-table]]   the same, as a table by micro / meso / macro
 *   [[diagram:data-model]]   the documents of an org and how they connect
 *   [[diagram:plugins]]      a card for each plugin
 */
export const HELP_VERSION = 1;

export const HELP_SEED = {
  version: HELP_VERSION,
  sections: [
    {
      id: 'ecosystem-mapping',
      title: 'Ecosystem mapping',
      icon: 'mapper',
      blurb: 'Map the actors, relationships and feedback loops in your change ecosystem.',
      pages: [
        {
          id: 'getting-started',
          title: 'Getting started with a map',
          body: `The Ecosystem Mapper holds as many maps as you need. Each has an owner and members, and its own actors, connectors, groups and layers.

# Make your first map
1. Open **Ecosystem Mapper** from the header and press **New map**.
2. Pick a lens to draw behind the map. You can switch lens at any time.
3. Click **Actor** or **Agent** to add one, or drag the button onto the board to drop it where you want. Drag an actor to change how deep it sits.
4. Drag from the small box on an actor's top-left corner to another actor to connect them. Pick the connector's type and its strength (1 to 5, drawn as thickness) on the right. Each type has its own line end.

# Tips
- Click a zone of the lens (like Meso) and the actors in it signal.
- **Tidy** (beside Fit) spaces the actors out for the lens you're on. Each stays in its zone and layer; Undo puts them back.
- Put actors into **groups** to show coalitions or sectors, give a group a description, and move it (with its connectors) to its own layer to show and hide it.
- **Data viz** (D): click an actor or connector to light up everything it's connected to for 15 seconds while the rest dims.
- A task in Strategy & Work can point at map actors as assets, so work and the ecosystem stay linked.
- Members of a map can edit it; everyone else in the organisation can view it.`,
        },
        {
          id: 'lenses',
          title: 'How the lenses line up',
          body: `The Ecosystem Mapper draws one of five systems models behind your map. They look different (rings, a triangle, bands, a grid) but they all describe the same thing: how deep a change goes. So the platform puts them on one shared scale.

**One depth scale.** Every actor stores a depth from 0 to 1. At 0 is the surface: what is explicit, structural and collective, like policies, budgets and resource flows. At 1 is the deep end: what is implicit and personal, like mindsets, beliefs and paradigms. Each lens divides that scale into its own regions. When you switch lens, an actor keeps its depth and lands in whichever region of the new lens sits at that depth.

[[diagram:lenses]]

# Micro, meso and macro as the reference
Micro / Meso / Macro has three equal tiers, so it is the easiest way to read across. The table lists, for each tier, the regions of the other lenses that sit within it (a region counts when its middle falls inside the tier).

[[diagram:lens-table]]

> Why is the deep end micro? The scale runs from explicit to implicit, not from small to large. Policy and budgets are visible and collective (macro, structural); mindsets live in people (micro, transformative). Treat the edges as soft: the original authors don't all claim these exact equivalences.`,
        },
        {
          id: 'reading-lenses',
          title: 'Reading each lens',
          body: `# Water of Systems Change
Lines up one to one. Structural change (policies, practices, resource flows) is macro; relational change (relationships, power) is meso; transformative change (mental models) is micro.

# Spheres of Systems Change
NPC groups its eight spheres as micro, meso and macro, and the platform keeps those groups: cultural and political spheres are macro; infrastructural and collective are meso; organisational, relational, behavioural and internal are micro.

# Leverage points
Meadows' twelve places to intervene run from shallow (12, numbers) to deep (1, transcending paradigms). Points 12 to 9 are macro, 8 to 5 are meso, and 4 to 1 are micro.

# Theory of System Change
Its iceberg rows run from events (macro), through patterns and structures (meso), to beliefs and mental models (micro). Its columns (adopt, adapt, expand, respond) are breadth, not depth, so switching to this lens spreads actors left to right by how far a change has spread.`,
        },
      ],
    },
    {
      id: 'podcasting',
      title: 'Podcasting',
      icon: 'mic',
      blurb: 'Run your own podcast station: shows, seasons, episodes and RSS feeds.',
      pages: [
        {
          id: 'your-station',
          title: 'Your station',
          body: `**Podcasts** gives your organisation its own station: a public page with your shows, organised by season, with a player that keeps playing as listeners move around your site.

# Set it up
1. In Podcasts, open **Station**. Give it a name, a tagline and some art.
2. Choose the **public site** the station lives on. The site must be public for listeners to find it.
3. Choose how it looks: the player, the cover art style and the top of the page. These sit on top of your organisation's colours.
4. Mark the shows to **feature**. Featured shows lead the station page, in the order you set.

If Podcasts isn't in your header, ask your platform admin to switch it on for your organisation.`,
        },
        {
          id: 'publishing-episodes',
          title: 'Publishing episodes',
          body: `Episodes are uploaded as **.mp3** or **.wav** files, up to 200 MB.

# The quick way
The Workbench has a **Podcast publishing** mini-tool: pick a show and season, choose a file, give it a title, and publish it now, schedule it, or save it as a draft. Drafts and scheduled episodes are listed there with a **Publish now** button.

# With all the details
In Podcasts, open a show and press **Add episode**. There you can also write show notes (bold, italic, lists and links work), choose the episode type (full, trailer or bonus), and credit the people in it.

# Who can hear what
- **Draft**: only staff can see it.
- **Scheduled**: goes out by itself on the date you choose.
- **Published**: on the station page, and in the show's RSS feed.

Audio stays private until the episode is published.`,
        },
        {
          id: 'rss',
          title: 'RSS feeds and podcast apps',
          body: `Each show has an RSS feed in the form podcast apps expect (RSS 2.0 with the iTunes tags). Open a show and press **RSS feed** to see or download it.

The fields follow [Castopod](https://castopod.org)'s model, so moving to a Castopod server later would not mean reshaping your data.`,
        },
      ],
    },
    {
      id: 'dashboards',
      title: 'Dashboards',
      icon: 'chart',
      blurb: 'Show your progress with dashboards built from your strategy and program data.',
      pages: [
        {
          id: 'making-a-dashboard',
          title: 'Making a dashboard',
          body: `Dashboards live in the **Workbench**. They are built from the measures you give objectives and goals in Strategy & Work.

1. In the Workbench, open **Dashboards**.
2. Pick an objective or goal under **Start from** and press **Create dashboard**. You get a widget for each of its measures. Or start blank.
3. Add, remove and reorder widgets: numbers (KPIs), lines over time, progress against targets, task progress.
4. Press **Play** to watch the year change month by month.`,
        },
        {
          id: 'program-data',
          title: 'Keeping the numbers current',
          body: `The **Program data** mini-tool in the Workbench holds the monthly value of each measure. Change a number and every dashboard and public site using it updates.

The **Strategic data** tab in Strategy & Work shows every measure's latest value against its target, so you can see where data is missing or out of date.`,
        },
        {
          id: 'sharing',
          title: 'Sharing and data postcards',
          body: `A dashboard is **private** (staff and board) until you make it **public** and pick a site for it. The Workbench's **Publishing** mini-tool shows what each site carries.

**Data postcards** turn one measure into a picture in your colours, with alt text, for newsletters, social posts and slides. Pick a measure, add a headline, and download the PNG.`,
        },
      ],
    },
    {
      id: 'public-sites',
      title: 'Public sites',
      icon: 'globe',
      blurb: 'Pages, news, dashboards and your station, on sites in your own look.',
      pages: [
        {
          id: 'how-sites-work',
          title: 'How a site is put together',
          body: `An organisation can have several sites, each **public** or **private** (staff and board only). Set them up in **Organisation settings → Public sites and theme**.

- **Home**: the site's public dashboards, with the latest news and the newest episode above them.
- **Menu**: pages marked "In the menu", then News and the podcast station when the site has them.
- **Look**: a colour palette and a shape, from Organisation settings. The station adds its own player and cover style.

Visitors only ever see what is published: public dashboards, published episodes and live pages. Everything else stays on the server.`,
        },
        {
          id: 'pages-and-news',
          title: 'Pages and news',
          body: `**Sites & Pages** is where you write information pages and news articles.

# Writing
Bodies use light markdown: **bold**, _italic_, lists, links, quotes and headings that start with #.

# Live embeds
Put a line on its own like \`[[dashboard:dash-equity]]\`, \`[[episode:ep-sv-3]]\` or \`[[show:pod-stem-voices]]\` to show that item, live. The editor's **Insert** menu writes these for you.

# Publishing
A page is a draft until you publish it. Give it a future date to schedule it.`,
        },
      ],
    },
    {
      id: 'adding',
      title: 'Adding to the platform',
      icon: 'plus',
      blurb: 'How Dashi fits together, and where new plugins, lenses and tools plug in.',
      pages: [
        {
          id: 'plugins',
          title: 'The plugins',
          body: `Dashi is one platform for an organisation's planning, ecosystem mapping, data and storytelling. Each tool is a plugin; they share one set of people, one strategy and one data model, so work in one shows up in the others.

[[diagram:plugins]]

Your organisation's admin switches plugins on and off in **Organisation settings → Plugins**. Some plugins depend on your plan; the platform admin adds or pauses them.`,
        },
        {
          id: 'data-model',
          title: 'The data model',
          body: `Everything belongs to an organisation. Each organisation has a handful of documents, each a plain JSON object that one plugin owns. Plugins point at each other's things by id, never by copying.

[[diagram:data-model]]

# Every change is an operation
Plugins never edit a document directly. They send small operations (add, update, remove, move) to a store, which applies them and keeps their inverses. That gives undo and redo everywhere.`,
        },
        {
          id: 'extending',
          title: 'Extending Dashi',
          body: `- **A plugin**: make a page and its module, then add an entry to \`src/plugins.js\`. It appears on the dashboard, in the header and in Organisation → Plugins.
- **A Workbench mini-tool**: write a function that returns its page and add it to \`MINI_TOOLS\` in \`src/palette/main.js\`.
- **A lens**: add a JSON file to \`src/lenses/\` with regions on the 0 to 1 depth scale. It shows up in the lens diagram by itself.
- **A palette**: add a DaisyUI theme to \`src/platform/themes.js\`.
- **A help page**: platform admins can edit this library in Help. Press **Edit help**.

See \`ARCHITECTURE.md\` for where everything else plugs in.`,
        },
      ],
    },
  ],
};
