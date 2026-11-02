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
export const HELP_VERSION = 2;

/**
 * Sections added since a version: a saved (edited) library that is older
 * gets them too, at the top, so new guides reach every server.
 */
export const HELP_ADDED = { alpha: 2 };

export const HELP_SEED = {
  version: HELP_VERSION,
  sections: [
    {
      id: 'alpha',
      title: 'Testing Dashi (alpha)',
      icon: 'ticket',
      blurb: 'You’re one of the first people using Dashi. What to try, how to tell us what you find, and what to expect.',
      pages: [
        {
          id: 'welcome',
          title: 'Welcome, and thank you',
          body: `Dashi is in **alpha**: the main parts work, some are rough, and things will change. You're here to use it for real work and tell us where it helps, where it gets in the way, and where it breaks.

# What alpha means
- **It works, but isn't finished.** Expect a few bugs and some rough edges.
- **Your work is kept.** The database is backed up every day. If something goes wrong we can bring back yesterday's copy.
- **It changes often.** New versions arrive every week or two. The version is under the Dashi name (top left): hover on **alpha** to see it.

# The two things that help most
1. **Use it for something real**: this month's plan, an actual reading list, a map of your real partners.
2. **Tell us**, even about small things. Use **Feedback** (the round button, bottom right of every page). It takes a minute.`,
        },
        {
          id: 'what-to-try',
          title: 'What to try',
          body: `Pick what fits your role. Half an hour is plenty for a first go.

# Everyone
- [ ] Sign in, open **My profile** (the menu under your picture), and add your title and picture.
- [ ] Open the **Dashboard**. Does it tell you what you need to know?
- [ ] Find something in **Help** without asking anyone.

# If you map ecosystems
- [ ] Make a map, add ten actors, connect them, and try two different lenses.
- [ ] Use **Panels** (top right of the Mapper) to dock, float and tidy the tool panels.
- [ ] **To library** keeps the map as a file in the Library; open it again from there.

# If you plan
- [ ] In **Strategy & Work**, add an objective, a goal, a workplan and a few tasks with dates and people.
- [ ] Attach assets to a task: an actor, a whole map, a document.
- [ ] Make the plan document in the **Plan designer** and look at its web view.

# If you read and write briefs
- [ ] In **Library**, use **Add a reading** to add five sources with annotations and tags.
- [ ] Open **Tags** and see your vocabulary; rename or merge one.
- [ ] In a bibliography's **Weekly brief**, pick a layout (STEEPLE, Micro / Meso / Macro, or a lexicon facet) and draft the brief.

# If you run the org
- [ ] Add a person in **Organisation → People** and send them an invitation.
- [ ] Publish a dashboard or page to your public site, and look at it signed out.`,
        },
        {
          id: 'reporting',
          title: 'How to report a problem or idea',
          body: `Press **Feedback** at the bottom right of any page, or **Ask or report something** in Help.

# A good report
- **What you were doing**: "I was adding a connector between two actors…"
- **What you expected**, and **what happened instead**.
- **Whether it stops you working.** Tick the box and we'll look first.

# What's sent with it
With **Include technical details** ticked, the report carries the page you were on, Dashi's version, your browser and screen size, and the last few error messages on that page. It never includes the contents of your documents. Open **What's sent** in the form to see exactly what goes.

# Following up
Your reports are under **Help → Support**. Replies arrive there and by email. Reply in the same place if we ask for more, and close it when it's sorted. Only you and the Dashi team can see your tickets.`,
        },
        {
          id: 'known-limits',
          title: 'Known limits in this version',
          body: `Things we know about, so you don't need to report them (but do tell us if one gets in your way):

- **Editing the same thing at the same time.** If two people change the same plan or map at once, the second save is refused and you're asked to reload. Nothing is overwritten, but the second person's last change needs redoing. Live co-editing comes later.
- **Phones.** Dashi works on a phone for reading and small edits. The Mapper, Studio and spreadsheets want a bigger screen.
- **Payments.** Plans can't be paid for yet; testers are on the house.
- **Email.** Invitations and password links need the server's email to be set up. If one doesn't arrive, ask your admin to set your password instead.`,
        },
        {
          id: 'your-data',
          title: 'Your data during the alpha',
          body: `- Your organisation's documents are kept on Dashi's server in Toronto, Canada, and backed up daily.
- Only people on your organisation's staff list can sign in to it. Visitors see only what you publish.
- The Dashi team can see your organisation's data to fix problems, and won't use it for anything else.
- On a **test server** (it says so in a yellow bar at the top), data may be reset. Don't put anything private there.
- Want your data out, or deleted? Ask through **Feedback** and we'll do it.`,
        },
      ],
    },
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
          body: `Dashboards live in the **Data Workbench**. They are built from the measures you give objectives and goals in Strategy & Work.

1. In the Data Workbench, open **Dashboards**.
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
          body: `A dashboard is **private** (staff and board) until you make it **public** and pick a site for it. The Data Workbench's **Publishing** mini-tool shows what each site carries.

**Data postcards** turn one measure into a picture in your colours, with alt text, for newsletters, social posts and slides. Pick a measure, add a headline, and download the PNG.`,
        },
        {
          id: 'calculators-stories',
          title: 'Impact calculators and data stories',
          body: `An **impact calculator** is a slider for your site: "a gift of $50 means 3 more youth in a program". Give what the work costs a year and pick the measures it moves. The cost of one comes from your program data, so it stays current. Type a yearly count or a cost of its own on an outcome to override it.

A **data story** tells what the numbers mean one step at a time. Each step has a few words, a chart that changes as readers scroll, and an audio clip if you have one.

Both publish like dashboards: make one public and choose a site. Calculators show on the site's home page and stories are listed there. Put either in a page with \`[[calculator:id]]\` or \`[[story:id]]\`, or use the Insert menu in the page editor.`,
        },
      ],
    },
    {
      id: 'studio',
      title: 'Planning Studio',
      icon: 'studio',
      blurb: 'Facilitate a strategic plan together: SOAR, context, results, and wiring ideas into objectives and goals.',
      pages: [
        {
          id: 'studio-flow',
          title: 'From SOAR to a plan',
          body: `The Planning Studio works on the plans in your strategic framework (the same ones as in Strategy & Work). Each plan has:

- **Plan home:** its dates, the mission and vision it serves, its operating context and its planning team.
- **SOAR board:** one big shared canvas with the four quadrants meeting in the middle. Double-click anywhere to add a sticky note, drag notes to move them (into another quadrant too), and click the dot to vote. The nearer a note is to the centre, the more it matters: its border is thickest (5px) at the centre and thins out further away. Drag the background to pan, use − and + (or Ctrl/⌘ + scroll) to zoom, and **Centre** to come back. **Rank by dots** moves the most-voted notes closest in. Everyone with the plan open sees changes as they save.
- **Strengths, Opportunities, Aspirations:** the same cards as lists, most dotted first, where you can say more and link assets with the asset chooser.
- **Results:** a grid of result cards, each with an indicator, baseline, target, source and how often it is measured. Link a Strategy & Work measure to use its live data.
- **Assemble:** drag cards, context, results and assets onto the canvas, add goals, objectives and workplans, and patch outlets into inlets: ideas and workplans into goals, goals into objectives, objectives into the plan. **Bring in the plan** lays out the plan as it already stands in Strategy & Work, so you can see and rearrange the whole thing. Renaming a block that is already in the plan renames it there too; a workplan's link opens it in Strategy & Work for dates, people and tasks. **Send to plan** makes anything new in Strategy & Work, and sending again updates rather than copies. Zoom with − and +, and **Centre** fits everything in view.`,
        },
        {
          id: 'studio-live',
          title: 'Running a live session',
          body: `Share the plan's SOAR board link with everyone in the session. Each card remembers who added it and when it last changed, so people working at the same time only overwrite each other if they change the very same card at the same moment. The **Live** chip pulses when someone else's change arrives.

Ctrl+Z (or ⌘+Z) undoes your own last change.`,
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
          body: `**Web views** (formerly Sites & Pages) is where you write information pages and news articles.

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
- **A Data Workbench mini-tool**: write a function that returns its page and add it to \`MINI_TOOLS\` in \`src/palette/main.js\`.
- **A lens**: add a JSON file to \`src/lenses/\` with regions on the 0 to 1 depth scale. It shows up in the lens diagram by itself.
- **A palette**: add a DaisyUI theme to \`src/platform/themes.js\`.
- **A help page**: platform admins can edit this library in Help. Press **Edit help**.

See \`ARCHITECTURE.md\` for where everything else plugs in.`,
        },
      ],
    },
  ],
};
