<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, onDestroy } from 'svelte';

	let { data, form } = $props();

	let uploading = $state(false);
	let fileName = $state('');
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	// Job tracking
	let jobId = $state<string | null>(data.activeJobId ?? null);
	let jobStatus = $state<string | null>(data.activeJobId ? 'active' : null);
	let progress = $state<{ current: number; total: number; imported: number; skipped: number; failed: number } | null>(
		(data.progress as { current: number; total: number; imported: number; skipped: number; failed: number }) ?? null,
	);
	let eventSource: EventSource | null = null;

	// Resume stream for active job on page load
	onMount(() => {
		if (data.activeJobId) {
			startStream(data.activeJobId);
		}
	});

	function startStream(id: string) {
		jobId = id;
		jobStatus = 'waiting';
		progress = null;
		stopStream();

		const es = new EventSource(`/api/import/stream?jobId=${id}`);
		eventSource = es;

		es.addEventListener('progress', (e) => {
			jobStatus = 'active';
			progress = JSON.parse(e.data);
		});

		es.addEventListener('complete', (e) => {
			jobStatus = 'completed';
			progress = JSON.parse(e.data);
			stopStream();
		});

		es.addEventListener('cancelled', (e) => {
			jobStatus = 'cancelled';
			const data = JSON.parse(e.data);
			if (data.current) progress = data;
			stopStream();
		});

		es.addEventListener('failed', (e) => {
			jobStatus = 'failed';
			const data = JSON.parse(e.data);
			if (data.progress) progress = data.progress;
			stopStream();
		});

		es.addEventListener('error', () => {
			stopStream();
		});
	}

	function stopStream() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

	async function cancelImport() {
		if (!jobId) return;
		await fetch(`/api/import?jobId=${jobId}`, { method: 'DELETE' });
		jobStatus = 'cancelled';
		stopStream();
	}

	onDestroy(stopStream);

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
	}

	function setFile(file: File) {
		if (!file.name.endsWith('.zip')) return;
		fileName = file.name;
		if (fileInput) {
			const dt = new DataTransfer();
			dt.items.add(file);
			fileInput.files = dt.files;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) setFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	let isActive = $derived(jobStatus === 'waiting' || jobStatus === 'active' || jobStatus === 'delayed');
</script>

<h1 class="text-xl font-bold mb-2">Import Strava Export</h1>
<p class="text-sm text-zinc-500 mb-6">
	Upload your Strava data export ZIP file to import all activities at once.
	Request your archive from Strava Settings &gt; My Account &gt; Download or Delete Your Account.
</p>

{#if isActive}
	<div class="mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded">
		<div class="flex items-center justify-between mb-2">
			<span class="text-sm font-medium">
				{#if progress}
					Importing {progress.current} of {progress.total} activities...
				{:else if jobStatus === 'waiting'}
					Waiting to start...
				{:else}
					Starting import...
				{/if}
			</span>
			<button
				onclick={cancelImport}
				class="text-xs text-zinc-500 hover:text-red-600 border border-zinc-200 rounded px-2 py-1"
			>Cancel</button>
		</div>
		{#if progress}
			<div class="w-full bg-zinc-200 rounded-full h-2 mb-2">
				<div
					class="bg-zinc-800 h-2 rounded-full transition-all"
					style="width: {Math.round((progress.current / progress.total) * 100)}%"
				></div>
			</div>
			<div class="flex gap-4 text-xs text-zinc-500">
				<span>{progress.imported} imported</span>
				{#if progress.skipped > 0}<span>{progress.skipped} skipped</span>{/if}
				{#if progress.failed > 0}<span class="text-red-500">{progress.failed} failed</span>{/if}
			</div>
		{/if}
	</div>
{:else if jobStatus === 'completed'}
	<div class="mb-6 p-4 bg-green-50 border border-green-200 rounded text-sm text-green-800">
		Import complete.
		{#if progress}
			{progress.imported} imported, {progress.skipped} skipped, {progress.failed} failed out of {progress.total}.
		{/if}
	</div>
{:else if jobStatus === 'cancelled' && progress}
	<div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
		Import cancelled.
		{progress.imported} of {progress.total} activities were imported before cancellation.
	</div>
{:else if form?.error}
	<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800">
		{form.error}
	</div>
{/if}

{#if !isActive}
	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		use:enhance={() => {
			uploading = true;
			return async ({ result, update }) => {
				await update();
				uploading = false;
				if (result.type === 'success' && result.data?.jobId) {
					startStream(result.data.jobId as string);
					fileName = '';
				}
			};
		}}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors {dragging ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-200'}"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
		>
			<label class="cursor-pointer block">
				<input
					bind:this={fileInput}
					type="file"
					name="file"
					accept=".zip"
					class="hidden"
					onchange={handleFileChange}
				/>
				{#if fileName}
					<div class="text-sm font-medium text-zinc-900 mb-1">{fileName}</div>
					<div class="text-xs text-zinc-500">Click or drop to change file</div>
				{:else}
					<div class="text-sm text-zinc-500 mb-1">Drop your Strava export ZIP here, or click to select</div>
					<div class="text-xs text-zinc-400">Maximum 2GB</div>
				{/if}
			</label>
		</div>

		<button
			type="submit"
			disabled={!fileName || uploading}
			class="px-4 py-2 bg-zinc-800 text-white rounded text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{uploading ? 'Uploading...' : 'Upload & Import'}
		</button>
	</form>
{/if}

<div class="mt-8 text-xs text-zinc-400 space-y-1">
	<p>Supported formats: FIT, GPX, TCX activity files within the ZIP.</p>
	<p>Existing activities will be updated with richer data from the export files.</p>
	<p>This does not use Strava API quota.</p>
</div>
