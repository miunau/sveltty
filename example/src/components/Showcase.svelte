<script lang="ts">
    let count = $state(0);
    let name = $state('');
    let password = $state('');
    let age = $state('');
    let flavor = $state('vanilla');
    let agree = $state(false);
    let submitted = $state(false);
    let popoverEl: HTMLElement;
    let dialogEl: HTMLDialogElement;
    let bio = $state('');
    let progress = $state(0.7);
    let diskUsage = $state(0.45);

    $effect(() => {
        const interval = setInterval(() => {
            count++;
        }, 1000);
        return () => clearInterval(interval);
    });

    function handleSubmit() {
        submitted = true;
        popoverEl?.showPopover?.();
    }

    let hit = $state(0);

    function closePopover() {
        hit++;
        popoverEl?.hidePopover?.();
    }

    function openDialog() {
        dialogEl?.showModal?.();
    }

    function closeDialog() {
        dialogEl?.close?.();
    }
</script>

<main class="appFrame">
    <h1 class="title">SvelTTY</h1>

    <p>hit: {hit}</p>

    <p>🐝 According to all known laws of aviation, there is no way a bee should be able to fly. Its wings are too small to get it's fat little body off the grou🐝nd. The bee, of course, flies any🐝way because bees don't care what humans think is impossible.</p>
    <div>
        <p>
            HTML Entities: &lt; &gt; &amp; &quot; &apos; &nbsp; &copy; &reg; &trade;
        </p>
    </div>

    <img src="https://miunau.com/img/tekkHi.png" alt="Miu" width="10" height="5" />

    <form onsubmit={handleSubmit}>
        <section class="statusRow">
            <span class="statusLabel">Count</span>
            <span class="statusValue">{count}</span>
            <span class="statusValue">{submitted ? '✓ Submitted' : '✗ Not submitted'}</span>
        </section>

        <section class="formGrid">
            <div class="inputRow">
                <label for="name">Name</label>
                <input id="name" class="field" bind:value={name} placeholder="Your name" />
            </div>

            <div class="inputRow">
                <label for="password">Password</label>
                <input
                    id="password"
                    class="field"
                    type="password"
                    bind:value={password}
                    placeholder="secret"
                />
            </div>

            <div class="inputRow">
                <label for="age">Age</label>
                <input id="age" class="field" type="number" bind:value={age} />
            </div>

            <div class="inputRow">
                <label for="flavor">Flavor</label>
                <select id="flavor" class="field selectField" bind:value={flavor}>
                    <optgroup label="Classic">
                        <option value="vanilla">Vanilla</option>
                        <option value="chocolate">Chocolate</option>
                        <option value="strawberry">Strawberry</option>
                        <option value="neapolitan">Neapolitan</option>
                        <option value="cookies-cream">Cookies & Cream</option>
                    </optgroup>
                    <optgroup label="Premium">
                        <option value="pistachio">Pistachio</option>
                        <option value="salted-caramel">Salted Caramel</option>
                        <option value="rocky-road">Rocky Road</option>
                        <option value="butter-pecan">Butter Pecan</option>
                        <option value="coffee">Coffee</option>
                        <option value="tiramisu">Tiramisu</option>
                        <option value="hazelnut">Hazelnut</option>
                    </optgroup>
                    <optgroup label="Fruity">
                        <option value="mango">Mango</option>
                        <option value="raspberry">Raspberry</option>
                        <option value="lemon">Lemon Sorbet</option>
                        <option value="blueberry">Blueberry</option>
                        <option value="peach">Peach</option>
                        <option value="cherry">Cherry</option>
                        <option value="banana">Banana</option>
                        <option value="coconut">Coconut</option>
                    </optgroup>
                    <optgroup label="Exotic">
                        <option value="matcha">Matcha Green Tea</option>
                        <option value="lavender">Lavender Honey</option>
                        <option value="rose">Rose</option>
                        <option value="black-sesame">Black Sesame</option>
                        <option value="ube">Ube (Purple Yam)</option>
                        <option value="thai-tea">Thai Tea</option>
                        <option value="earl-grey">Earl Grey</option>
                    </optgroup>
                    <optgroup label="Decadent">
                        <option value="brownie">Brownie Fudge</option>
                        <option value="cheesecake">Cheesecake</option>
                        <option value="red-velvet">Red Velvet</option>
                        <option value="dulce-leche">Dulce de Leche</option>
                        <option value="caramel-swirl">Caramel Swirl</option>
                    </optgroup>
                    <optgroup label="Seasonal">
                        <option value="pumpkin">Pumpkin Spice</option>
                        <option value="peppermint">Peppermint</option>
                        <option value="mint-chip">Mint Chip</option>
                        <option value="caramel">Caramel</option>
                        <option value="gingerbread">Gingerbread</option>
                        <option value="eggnog">Eggnog</option>
                    </optgroup>
                </select>
            </div>

            <div class="inputRow">
                <label for="agree">Agree</label>
                <input id="agree" type="checkbox" bind:checked={agree} />
            </div>
        </section>

        <div class="buttonRow">
            <button class="primaryButton" type="submit">Submit</button>
        </div>

    </form>

    <!-- Textarea -->
    <section class="demoSection">
        <h2 class="sectionTitle">Textarea</h2>
        <div class="inputRow">
            <label for="bio">Bio</label>
            <textarea id="bio" class="textareaField" bind:value={bio} placeholder="Tell us about yourself..."></textarea>
        </div>
    </section>

    <!-- Progress & Meter -->
    <section class="demoSection">
        <h2 class="sectionTitle">Progress & Meter</h2>
        <div class="progressRow">
            <label>Download</label>
            <progress value={progress} max="1" class="progressBar"></progress>
            <span class="progressLabel">{Math.round(progress * 100)}%</span>
        </div>
        <div class="progressRow">
            <label>Disk Usage</label>
            <meter value={diskUsage} min="0" max="1" low="0.3" high="0.7" optimum="0" class="meterBar"></meter>
            <span class="progressLabel">{Math.round(diskUsage * 100)}%</span>
        </div>
    </section>

    <!-- Details/Summary -->
    <section class="demoSection">
        <h2 class="sectionTitle">Details & Summary</h2>
        <details class="detailsBox">
            <summary>Click to expand</summary>
            <p>This content is hidden until you open the details element.</p>
            <p>You can put any content here!</p>
            <img src="https://miunau.com/img/tekkHi.png" alt="Miu" width="10" height="5" />
        </details>
        <details class="detailsBox" open>
            <summary>Already open</summary>
            <p>This details element starts in the open state.</p>
        </details>
    </section>

    <!-- Fieldset/Legend -->
    <section class="demoSection">
        <h2 class="sectionTitle">Fieldset & Legend</h2>
        <fieldset class="fieldsetBox">
            <legend>Personal Info</legend>
            <div class="inputRow">
                <label for="nickname">Nickname</label>
                <input id="nickname" class="field" placeholder="Your nickname" />
            </div>
        </fieldset>
    </section>

    <!-- Lists -->
    <section class="demoSection">
        <h2 class="sectionTitle">Lists</h2>
        <div class="listsContainer">
            <div class="listColumn">
                <h3 class="listTitle">Unordered</h3>
                <ul class="demoList">
                    <li>First item</li>
                    <li>Second item</li>
                    <li>Third item
                        <ul>
                            <li>Nested A</li>
                            <li>Nested B</li>
                        </ul>
                    </li>
                </ul>
            </div>
            <div class="listColumn">
                <h3 class="listTitle">Ordered</h3>
                <ol class="demoList">
                    <li>Step one</li>
                    <li>Step two</li>
                    <li>Step three
                        <ol>
                            <li>Sub-step</li>
                            <li>Sub-step</li>
                        </ol>
                    </li>
                </ol>
            </div>
        </div>
    </section>

    <!-- Table -->
    <section class="demoSection">
        <h2 class="sectionTitle">Table</h2>
        <table class="demoTable">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Alpha</td>
                    <td>Primary</td>
                    <td class="statusActive">Active</td>
                </tr>
                <tr>
                    <td>Beta</td>
                    <td>Secondary</td>
                    <td class="statusPending">Pending</td>
                </tr>
                <tr>
                    <td>Gamma</td>
                    <td>Tertiary</td>
                    <td class="statusInactive">Inactive</td>
                </tr>
            </tbody>
        </table>
    </section>

    <!-- Code/Pre -->
    <section class="demoSection">
        <h2 class="sectionTitle">Code Block</h2>
        <pre class="codeBlock"><code>function greet(name: string) &#123;
    return `Hello, $&#123;name&#125;!`;
&#125;

console.log(greet("World"));</code></pre>
    </section>

    <!-- Dialog -->
    <section class="demoSection">
        <h2 class="sectionTitle">Dialog</h2>
        <button class="dialogButton" onclick={openDialog}>Open Modal Dialog</button>
    </section>

    <!-- Scroll Demo -->
    <section class="scrollDemo">
        <h2 class="scrollTitle">Overflow area</h2>
        <div class="scrollContainer">
            <button class="scrollItem item1">1. First item (Tab here)</button>
            <button class="scrollItem item2">2. Second item</button>
            <button class="scrollItem item3">3. Third item</button>
            <button class="scrollItem item4">4. Fourth item</button>
            <button class="scrollItem item5">5. Fifth item</button>
            <button class="scrollItem item6">6. Sixth item</button>
            <button class="scrollItem item7">7. Seventh item</button>
            <button class="scrollItem item8">8. Eighth item</button>
            <button class="scrollItem item9">9. Ninth item</button>
            <button class="scrollItem item10">10. Last item - you made it!</button>
        </div>
    </section>

    <div
        bind:this={popoverEl}
        popover="auto"
        id="submitPopover"
        class="submitPopover"
    >
        <h2 class="popoverTitle">Submitted Values</h2>
        <div class="popoverContent">
            <div class="popoverRow"><span>Name:</span><span>{name || '(empty)'}</span></div>
            <div class="popoverRow"><span>Password:</span><span>{'*'.repeat(password.length) || '(empty)'}</span></div>
            <div class="popoverRow"><span>Age:</span><span>{age || '(empty)'}</span></div>
            <div class="popoverRow"><span>Flavor:</span><span>{flavor}</span></div>
            <div class="popoverRow"><span>Agree:</span><span>{agree ? 'Yes' : 'No'}</span></div>
        </div>
        <button class="closeButton" autofocus onclick={closePopover}>Close</button>
    </div>

    <!-- Dialog Modal -->
    <dialog bind:this={dialogEl} class="modalDialog">
        <h2 class="dialogTitle">Modal Dialog</h2>
        <p>This is a modal dialog. Press Escape or click the button to close.</p>
        <p>The backdrop dims the content behind.</p>
        <button class="closeButton" onclick={closeDialog} autofocus>Close Dialog</button>
    </dialog>
</main>

<style>
.appFrame {
    border-style: single;
    border-color: #833ea0;
    border-background-color: #d9b421;
    background-color: #1e293b;
    gap: 1ch;
    padding: 1ch 2ch;
    width: 100%;
    height: 100%;
    color: #e0f2fe;
    --label-color: #7dfce5;
    overflow: auto;
}

.title {
    color: #f8e838;
    text-align: center;
    padding: 5ch;
    background: conic-gradient(from 45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
    font-weight: bold;
}

.statusRow {
    flex-direction: row;
    gap: 1ch;
}

.statusLabel {
    width: 12ch;
    text-align: right;
    color: var(--label-color);
}

.statusValue {
    color: #24fba5;
    font-weight: bold;
}

.formGrid {
    gap: 0;
}

.inputRow {
    flex-direction: row;
    gap: 1ch;
    align-items: center;
}

label {
    color: var(--label-color);
    width: 12ch;
    text-align: right;
}

.field {
    flex-grow: 1;
    border-style: single;
    color: #e0f2fe;
    padding: 0 1ch;
}

.selectField {
    color: #86efac;
}

.primaryButton {
    font-weight: bold;
    padding: 0 2ch;
}

.submitPopover {
    position: fixed;
    top: 3;
    left: 10ch;
    width: 35ch;
    border-style: double;
    border-color: #22c55e;
    background-color: #1e293b;
    border-background-color: #1e293b;
    padding: 1ch;
    gap: 1ch;
    z-index: 100;
}

.popoverTitle {
    color: #22c55e;
    font-weight: bold;
    text-align: center;
}

.popoverContent {
    gap: 0;
}

.popoverRow {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 1ch;
}

.popoverRow span:first-child {
    width: 10ch;
    color: #94a3b8;
    text-align: right;
}

.popoverRow span:last-child {
    color: #f1f5f9;
    text-wrap: wrap;
}

.closeButton {
    font-weight: bold;
    padding: 0 2ch;
    align-self: center;
}

.scrollDemo {
    gap: 0;
}

.scrollTitle {
    color: #38bdf8;
    font-weight: bold;
}

.scrollContainer {
    border-style: single;
    border-color: #38bdf8;
    background-color: #0f172a;
    padding: 0 1ch;
    height: 5ch;
    overflow: auto;
}

.scrollContainer:focus {
    border-color: #22c55e;
    background-color: #1a2744;
}

.scrollItem {
    padding: 0 1ch;
    border-style: none;
    background-color: transparent;
    text-align: left;
    height: 1;
}

.item1 { color: #f87171; }
.item2 { color: #fb923c; }
.item3 { color: #fbbf24; }
.item4 { color: #a3e635; }
.item5 { color: #4ade80; }
.item6 { color: #2dd4bf; }
.item7 { color: #22d3ee; }
.item8 { color: #60a5fa; }
.item9 { color: #a78bfa; }
.item10 { color: #f472b6; }


.scrollItem:focus {
    color: white;
}

.scrollHint {
    color: #64748b;
    font-style: italic;
}

/* Demo sections */
.demoSection {
    gap: 1ch;
}

.sectionTitle {
    color: #38bdf8;
    font-weight: bold;
}

/* Textarea */
.textareaField {
    flex-grow: 1;
    height: 4;
    border-style: single;
    color: #e0f2fe;
    padding: 0 1ch;
}

/* Progress & Meter */
.progressRow {
    flex-direction: row;
    gap: 1ch;
    align-items: center;
}

.progressBar {
    width: 20ch;
    --progress-bar-color: #22c55e;
    --progress-track-color: #334155;
}

.meterBar {
    width: 20ch;
    --meter-good-color: #22c55e;
    --meter-average-color: #eab308;
    --meter-poor-color: #ef4444;
    --meter-track-color: #334155;
}

.progressLabel {
    color: #94a3b8;
    width: 5ch;
}

/* Details */
.detailsBox {
    border-style: single;
    border-color: #64748b;
    padding: 0 1ch;
}

.detailsBox summary {
    color: #f8fafc;
    font-weight: bold;
}

.detailsBox p {
    color: #94a3b8;
}

/* Fieldset */
.fieldsetBox {
    border-style: single;
    border-color: #8b5cf6;
    padding: 1ch;
}

.fieldsetBox legend {
    color: #a78bfa;
    font-weight: bold;
}

/* Lists */
.listsContainer {
    flex-direction: row;
    gap: 4ch;
}

.listColumn {
    flex: 1;
}

.listTitle {
    color: #fbbf24;
    font-weight: bold;
}

.demoList {
    --list-marker-color: #38bdf8;
}

.demoList li {
    color: #e2e8f0;
}

/* Table */
.demoTable {
    border-style: single;
    border-color: #475569;
}

.demoTable th {
    color: #f8fafc;
    background-color: #334155;
    font-weight: bold;
    padding: 0 1ch;
}

.demoTable td {
    color: #cbd5e1;
    padding: 0 1ch;
}

.statusActive {
    color: #22c55e;
}

.statusPending {
    color: #eab308;
}

.statusInactive {
    color: #64748b;
}

/* Code block */
.codeBlock {
    background-color: #0f172a;
    border-style: single;
    border-color: #334155;
    padding: 1ch;
    color: #a5f3fc;
    overflow: auto;
    height: 6;
}

/* Dialog */
.dialogButton {
    padding: 0 2ch;
}

.modalDialog {
    border-style: double;
    border-color: #f472b6;
    background-color: #1e293b;
    padding: 2ch;
    gap: 1ch;
    width: 40ch;
    --dialog-backdrop-color: rgba(0, 0, 0, 0.7);
}

.dialogTitle {
    color: #f472b6;
    font-weight: bold;
    text-align: center;
}

.modalDialog p {
    color: #e2e8f0;
}
</style>
