<script lang="ts">
    let count = $state(0);
    let name = $state('');
    let flavor = $state('vanilla');
    let agree = $state(false);
    let submitted = $state(false);

    $effect(() => {
        const interval = setInterval(() => {
            count++;
        }, 1000);
        return () => clearInterval(interval);
    });

    function handleSubmit() {
        submitted = true;
    }
</script>

<main class="appFrame">
    <h1 class="title">Test App</h1>

    <form onsubmit={handleSubmit}>
        <section class="statusRow">
            <span class="statusLabel">Count</span>
            <span class="statusValue">{count}</span>
            <span class="statusValue">{submitted ? 'SUBMITTED' : 'NOT_SUBMITTED'}</span>
        </section>

        <section class="formSection">
            <div class="inputRow">
                <label for="name">Name</label>
                <input id="name" class="field" tabIndex={0} bind:value={name} placeholder="Your name" />
            </div>

            <div class="inputRow">
                <label for="flavor">Flavor</label>
                <select id="flavor" class="field" tabIndex={1} bind:value={flavor}>
                    <option value="vanilla">Vanilla</option>
                    <option value="chocolate">Chocolate</option>
                    <option value="strawberry">Strawberry</option>
                </select>
            </div>

            <div class="inputRow">
                <label for="agree">Agree</label>
                <input id="agree" tabIndex={2} type="checkbox" bind:checked={agree} />
            </div>

            <div class="buttonRow">
                <button class="primaryButton" type="submit" tabIndex={3}>Submit</button>
            </div>
        </section>
    </form>
</main>

<style>
.appFrame {
    border-style: single;
    border-color: #4a5568;
    gap: 1ch;
    padding: 1ch 2ch;
    width: 100%;
    height: 100%;
    color: #e2e8f0;
    background-color: #1a202c;
}

.title {
    color: #63b3ed;
    font-weight: bold;
}

.statusRow {
    flex-direction: row;
    gap: 1ch;
}

.statusLabel {
    width: 10ch;
    text-align: right;
    color: #a0aec0;
}

.statusValue {
    color: #48bb78;
    font-weight: bold;
}

.formSection {
    gap: 1ch;
}

.inputRow {
    flex-direction: row;
    gap: 1ch;
    align-items: center;
}

label {
    color: #a0aec0;
    width: 10ch;
    text-align: right;
}

.field {
    flex-grow: 1;
    border-style: single;
    border-color: #4a5568;
    background-color: #2d3748;
    color: #e2e8f0;
    padding: 0 1ch;
}

.buttonRow {
    margin-top: 1ch;
}

.primaryButton {
    background-color: #4299e1;
    border-style: round;
    border-color: #63b3ed;
    color: #1a202c;
    font-weight: bold;
    padding: 0 2ch;
}
</style>

