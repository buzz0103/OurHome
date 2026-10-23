document.addEventListener("DOMContentLoaded", () => {
    const MEMBER_IDS = ["m1", "m2", "m3", "m4"];
    const PHOTO_BUCKET = "item-photos";
    const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
    const ME_KEY = "ourhome.me";

    const state = {
        names: { m1: "가족 1", m2: "가족 2", m3: "가족 3", m4: "가족 4" },
        me: readLocal(ME_KEY),
        events: [],
        items: [],
        filter: "all",
        deleteTarget: null,
        editingEventId: null,
        pendingPhoto: null,
        loaded: false,
    };

    const $ = (selector) => document.querySelector(selector);
    const isConfigured = typeof SUPABASE_ANON_KEY === "string" && !SUPABASE_ANON_KEY.startsWith("여기에");
    const client = isConfigured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    // ---------- 도우미 ----------
    function readLocal(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeLocal(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* 저장 실패해도 계속 */ }
    }

    // 사용자 입력은 항상 텍스트 노드로 넣어 안전하게 그리기
    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === "class") el.className = value;
            else el.setAttribute(key, value === true ? "" : value);
        });
        children.flat().forEach((child) => {
            if (child === null || child === undefined || child === false) return;
            el.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return el;
    }

    function showToast(message) {
        const toast = $("[data-toast]");
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
    }

    function setNotice(message) {
        const notice = $("[data-notice]");
        notice.textContent = message || "";
        notice.hidden = !message;
    }

    function nameOf(id) {
        return state.names[id] || "누군가";
    }

    function handleError(error) {
        console.error(error);
        showToast("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
    }

    // ---------- 날짜 ----------
    function parseDate(value) {
        const [y, m, d] = (value || "").split("-").map(Number);
        return y ? new Date(y, m - 1, d) : null;
    }
    function getDayDiff(value) {
        const date = parseDate(value);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return date ? Math.round((date - today) / 86400000) : null;
    }
    function formatDday(diff) {
        if (diff === 0) return "오늘";
        if (diff === 1) return "내일";
        return diff > 0 ? "D-" + diff : (-diff) + "일 지남";
    }
    function formatTime(value) {
        if (!value) return "";
        const [hh, mm] = value.split(":").map(Number);
        const ampm = hh < 12 ? "오전" : "오후";
        const hour12 = hh % 12 === 0 ? 12 : hh % 12;
        return ampm + " " + hour12 + "시" + (mm ? " " + mm + "분" : "");
    }
    function formatStamp(iso) {
        const d = new Date(iso);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + hh + ":" + mm;
    }
    function formatDate(value) {
        const date = parseDate(value);
        return (date.getMonth() + 1) + "월 " + date.getDate() + "일 (" + WEEKDAYS[date.getDay()] + ")";
    }

    // ---------- 데이터 ----------
    async function loadAll() {
        const [members, events, items] = await Promise.all([
            client.from("members").select("id, name"),
            client.from("events").select("*").order("date").order("time", { nullsFirst: true }),
            client.from("items").select("*").order("created_at"),
        ]);
        const failed = members.error || events.error || items.error;
        if (failed) {
            console.error(failed);
            setNotice("목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.");
            return;
        }
        setNotice("");
        members.data.forEach((row) => { state.names[row.id] = row.name; });
        state.events = events.data;
        state.items = items.data;
        state.loaded = true;
        renderAll();
    }

    let reloadTimer = null;
    function scheduleReload() {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(loadAll, 300);
    }

    function subscribeChanges() {
        client.channel("ourhome")
            .on("postgres_changes", { event: "*", schema: "public", table: "members" }, scheduleReload)
            .on("postgres_changes", { event: "*", schema: "public", table: "events" }, scheduleReload)
            .on("postgres_changes", { event: "*", schema: "public", table: "items" }, scheduleReload)
            .subscribe();
        // 휴대폰에서 다시 화면을 켰을 때 최신으로
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") scheduleReload();
        });
    }

    // ---------- 탭 ----------
    function selectTab(name) {
        const isSchedule = name !== "items";
        document.querySelectorAll("[data-tab]").forEach((tab) => {
            const active = tab.dataset.tab === (isSchedule ? "schedule" : "items");
            tab.classList.toggle("tabs_item-active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        $("[data-panel='schedule']").hidden = !isSchedule;
        $("[data-panel='items']").hidden = isSchedule;
        try { history.replaceState(null, "", "#" + (isSchedule ? "schedule" : "items")); } catch (e) { /* 무시 */ }
    }

    // ---------- 나 고르기 ----------
    function openWho() {
        renderNameGrid();
        $("[data-names-form]").hidden = true;
        $("[data-who]").hidden = false;
    }
    function closeWho() {
        $("[data-who]").hidden = true;
    }
    function renderNameGrid() {
        $("[data-name-grid]").replaceChildren(...MEMBER_IDS.map((id) => h("button", {
            type: "button",
            class: "modal_name" + (state.me === id ? " modal_name-active" : ""),
            "aria-pressed": String(state.me === id),
            "data-action": "choose-me",
            "data-id": id,
        }, nameOf(id))));
    }
    function openNamesForm() {
        const form = $("[data-names-form]");
        MEMBER_IDS.forEach((id) => { form.elements[id].value = state.names[id]; });
        form.hidden = false;
        form.elements.m1.focus();
    }
    async function saveNames(form) {
        const rows = MEMBER_IDS.map((id) => ({ id, name: form.elements[id].value.trim() || state.names[id] }));
        const { error } = await client.from("members").upsert(rows);
        if (error) { handleError(error); return; }
        rows.forEach((row) => { state.names[row.id] = row.name; });
        form.hidden = true;
        renderAll();
        renderNameGrid();
        showToast("이름을 저장했어요");
    }

    // ---------- 일정 ----------
    function renderSchedule() {
        const upcoming = state.events.filter((ev) => getDayDiff(ev.date) >= 0);
        const past = state.events.filter((ev) => getDayDiff(ev.date) < 0).reverse();
        const next = upcoming.find((ev) => !ev.done_at);

        $("[data-next]").replaceChildren(next ? h("div", { class: "next" },
            h("span", { class: "next_label" }, "다음 일정"),
            h("strong", { class: "next_dday" }, formatDday(getDayDiff(next.date))),
            h("span", { class: "next_title" }, next.title),
            h("span", { class: "next_when" }, [formatDate(next.date), formatTime(next.time), next.place].filter(Boolean).join(" · "))
        ) : "");

        const list = $("[data-event-list]");
        if (!state.loaded) {
            list.replaceChildren(h("li", { class: "empty" }, client ? "일정을 불러오는 중이에요…" : "아직 연결 설정이 안 됐어요."));
            return;
        }
        if (!state.events.length) {
            list.replaceChildren(h("li", { class: "empty" }, "아직 등록된 일정이 없어요.", h("br"), "계약일, 이사일, 잔금일 같은 날짜를 위 버튼으로 올려 주세요."));
            return;
        }
        list.replaceChildren(...upcoming.map(renderEvent), ...past.map(renderEvent));
    }
    function renderEvent(ev) {
        const date = parseDate(ev.date);
        const diff = getDayDiff(ev.date);
        const isDeleting = state.deleteTarget && state.deleteTarget.id === ev.id;
        const done = Boolean(ev.done_at);
        return h("li", { class: "schedule_item" + (done ? " schedule_item-done" : diff < 0 ? " schedule_item-past" : "") },
            h("div", { class: "schedule_date" },
                h("div", { class: "schedule_month" }, (date.getMonth() + 1) + "월"),
                h("div", { class: "schedule_day" }, date.getDate()),
                h("div", { class: "schedule_week" }, WEEKDAYS[date.getDay()] + "요일")),
            h("div", { class: "schedule_body" },
                done ? h("span", { class: "tag tag-green" }, "완료") : h("span", { class: "tag tag-blue" }, formatDday(diff)),
                h("div", { class: "schedule_title" }, ev.title),
                (ev.time || ev.place) ? h("div", { class: "schedule_meta" }, [formatTime(ev.time), ev.place].filter(Boolean).join(" · ")) : null,
                ev.note ? h("div", { class: "schedule_note" }, ev.note) : null,
                done
                    ? h("div", { class: "check check-done" },
                        h("button", { type: "button", class: "check_box", "aria-pressed": "true", "aria-label": "완료 취소", "data-action": "undone", "data-id": ev.id }),
                        h("span", { class: "check_text" }, "완료 · " + formatStamp(ev.done_at) + (ev.done_by ? " · " + nameOf(ev.done_by) : "")))
                    : h("div", { class: "check" },
                        h("button", { type: "button", class: "check_box", "aria-pressed": "false", "data-action": "done", "data-id": ev.id },
                            h("span", { class: "check_label" }, "완료했어요"))),
                h("div", { class: "schedule_actions" },
                    h("button", { type: "button", class: "link", "data-action": "edit-event", "data-id": ev.id }, "고치기"),
                    h("button", { type: "button", class: "link link-danger", "data-action": "ask-delete", "data-kind": "event", "data-id": ev.id }, "지우기")),
                isDeleting ? renderConfirm() : null)
        );
    }
    function openEventForm(id) {
        const form = $("[data-event-form]");
        const ev = state.events.find((row) => row.id === id) || {};
        state.editingEventId = id || null;
        $("[data-event-form-title]").textContent = id ? "일정 고치기" : "새 일정";
        form.elements.title.value = ev.title || "";
        form.elements.date.value = ev.date || "";
        form.elements.time.value = ev.time || "";
        form.elements.place.value = ev.place || "";
        form.elements.note.value = ev.note || "";
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.elements.title.focus({ preventScroll: true });
    }
    async function saveEvent(form) {
        const row = {
            title: form.elements.title.value.trim(),
            date: form.elements.date.value,
            time: form.elements.time.value || null,
            place: form.elements.place.value.trim() || null,
            note: form.elements.note.value.trim() || null,
        };
        if (!row.title || !row.date) { showToast("무엇을 하는지와 날짜는 꼭 적어 주세요"); return; }
        const query = state.editingEventId
            ? client.from("events").update(row).eq("id", state.editingEventId)
            : client.from("events").insert(row);
        const { error } = await query;
        if (error) { handleError(error); return; }
        form.hidden = true;
        showToast(state.editingEventId ? "일정을 고쳤어요" : "일정을 올렸어요");
        state.editingEventId = null;
        await loadAll();
    }

    async function setDone(id, done) {
        const row = done
            ? { done_at: new Date().toISOString(), done_by: state.me || null }
            : { done_at: null, done_by: null };
        const { error } = await client.from("events").update(row).eq("id", id);
        if (error) {
            console.error(error);
            showToast(/done_/.test(error.message || "")
                ? "완료 기록 칸이 아직 없어요. README의 '완료 기록 추가'를 먼저 실행해 주세요."
                : "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
            return;
        }
        await loadAll();
        showToast(done ? "완료로 표시했어요" : "완료를 취소했어요");
    }

    // ---------- 물건 ----------
    function renderItems() {
        const counts = Object.fromEntries(MEMBER_IDS.map((id) => [id, 0]));
        let freeCount = 0;
        state.items.forEach((item) => {
            if (counts[item.picked_by] !== undefined) counts[item.picked_by] += 1;
            else freeCount += 1;
        });

        $("[data-summary]").replaceChildren(...MEMBER_IDS.map((id) => h("button", {
            type: "button",
            class: "summary_item" + (state.filter === id ? " summary_item-active" : ""),
            "aria-pressed": String(state.filter === id),
            "data-action": "filter",
            "data-key": id,
        }, h("span", { class: "summary_count" }, counts[id] + "개"), h("span", { class: "summary_name" }, nameOf(id)))));

        const filters = [["all", "전체 " + state.items.length], ["free", "아직 주인 없음 " + freeCount]];
        if (state.me) filters.push([state.me, "내가 고른 것 " + counts[state.me]]);
        $("[data-filter]").replaceChildren(...filters.map(([key, label]) => h("button", {
            type: "button",
            class: "filter_item" + (state.filter === key ? " filter_item-active" : ""),
            "aria-pressed": String(state.filter === key),
            "data-action": "filter",
            "data-key": key,
        }, label)));

        const list = $("[data-item-list]");
        if (!state.loaded) {
            list.replaceChildren(h("li", { class: "empty" }, client ? "물건 목록을 불러오는 중이에요…" : "아직 연결 설정이 안 됐어요."));
            return;
        }
        if (!state.items.length) {
            list.replaceChildren(h("li", { class: "empty" }, "아직 올라온 물건이 없어요.", h("br"), "위 버튼을 눌러 사진과 이름을 올려 주세요."));
            return;
        }
        const shown = state.items.filter((item) => {
            if (state.filter === "all") return true;
            if (state.filter === "free") return !MEMBER_IDS.includes(item.picked_by);
            return item.picked_by === state.filter;
        });
        if (!shown.length) {
            list.replaceChildren(h("li", { class: "empty" }, "여기에 해당하는 물건이 없어요."));
            return;
        }
        list.replaceChildren(...shown.map(renderItem));
    }
    function renderItem(item, index) {
        const owner = MEMBER_IDS.includes(item.picked_by) ? item.picked_by : null;
        const mine = owner !== null && owner === state.me;
        const isDeleting = state.deleteTarget && state.deleteTarget.id === item.id;
        let status;
        let action = null;
        if (!owner) {
            status = h("span", { class: "goods_status goods_status-free" }, "아직 가져갈 사람 없음");
            action = h("button", { type: "button", class: "btn btn-primary", "data-action": "pick", "data-id": item.id }, "제가 가져갈게요");
        } else if (mine) {
            status = h("span", { class: "goods_status goods_status-mine" }, "내가 가져가요");
            action = h("button", { type: "button", class: "btn btn-secondary", "data-action": "unpick", "data-id": item.id }, "안 가져갈래요 (취소)");
        } else {
            status = h("span", { class: "goods_status goods_status-other" }, nameOf(owner) + "님이 가져가요");
        }
        return h("li", { class: "goods_item" + (mine ? " goods_item-mine" : "") },
            item.photo_url ? h("div", { class: "goods_thumb" },
                h("img", { class: "goods_img", src: item.photo_url, alt: item.name, width: "640", height: "220", loading: index < 2 ? "eager" : "lazy" })) : null,
            h("div", { class: "goods_body" },
                h("div", { class: "goods_name" }, item.name),
                item.location ? h("div", { class: "goods_where" }, item.location) : null,
                status,
                action,
                h("div", { class: "goods_foot" },
                    h("button", { type: "button", class: "link link-danger", "data-action": "ask-delete", "data-kind": "item", "data-id": item.id }, "목록에서 지우기")),
                isDeleting ? renderConfirm() : null)
        );
    }
    async function pickItem(id, take) {
        if (take && !state.me) {
            openWho();
            showToast("먼저 본인 이름을 골라 주세요");
            return;
        }
        // 비어 있을 때만 가져가기 / 내 것일 때만 취소 (동시에 눌러도 한 명만 성공)
        let query = client.from("items")
            .update({ picked_by: take ? state.me : null, picked_at: take ? new Date().toISOString() : null })
            .eq("id", id);
        query = take ? query.is("picked_by", null) : query.eq("picked_by", state.me);
        const { data, error } = await query.select("id");
        if (error) { handleError(error); return; }
        await loadAll();
        const item = state.items.find((row) => row.id === id);
        if (!data.length) {
            showToast(item && item.picked_by ? nameOf(item.picked_by) + "님이 먼저 골랐어요" : "이미 바뀌었어요. 다시 확인해 주세요");
            return;
        }
        showToast(take ? "'" + item.name + "' 가져가기로 했어요" : "취소했어요");
    }

    // 사진은 긴 변 1200px JPEG로 줄여서 올리기
    function shrinkImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }
    function openItemForm() {
        const form = $("[data-item-form]");
        form.reset();
        state.pendingPhoto = null;
        $("[data-photo-preview]").hidden = true;
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        form.elements.name.focus({ preventScroll: true });
    }
    async function saveItem(form) {
        const name = form.elements.name.value.trim();
        if (!name) { showToast("물건 이름을 적어 주세요"); return; }
        const submit = $("[data-item-submit]");
        submit.disabled = true;
        submit.textContent = "올리는 중…";
        try {
            const row = { name, location: form.elements.location.value.trim() || null };
            if (state.pendingPhoto) {
                const path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
                const upload = await client.storage.from(PHOTO_BUCKET).upload(path, state.pendingPhoto, { contentType: "image/jpeg" });
                if (upload.error) throw upload.error;
                row.photo_path = path;
                row.photo_url = client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
            }
            const { error } = await client.from("items").insert(row);
            if (error) throw error;
            form.hidden = true;
            showToast("물건을 올렸어요");
            await loadAll();
        } catch (error) {
            handleError(error);
        } finally {
            submit.disabled = false;
            submit.textContent = "올리기";
        }
    }

    // ---------- 지우기 확인 ----------
    function renderConfirm() {
        return h("div", { class: "confirm" },
            h("div", null, "'" + state.deleteTarget.label + "'을(를) 정말 지울까요?"),
            h("div", { class: "form_actions" },
                h("button", { type: "button", class: "btn btn-danger", "data-action": "confirm-delete" }, "네, 지울게요"),
                h("button", { type: "button", class: "btn btn-outline", "data-action": "cancel-delete" }, "아니요")));
    }
    function askDelete(kind, id) {
        const source = kind === "item" ? state.items : state.events;
        const row = source.find((r) => r.id === id);
        if (!row) return;
        state.deleteTarget = { kind, id, label: kind === "item" ? row.name : row.title, photoPath: row.photo_path || null };
        renderAll();
    }
    async function confirmDelete() {
        const target = state.deleteTarget;
        state.deleteTarget = null;
        const { error } = await client.from(target.kind === "item" ? "items" : "events").delete().eq("id", target.id);
        if (error) { handleError(error); renderAll(); return; }
        if (target.photoPath) await client.storage.from(PHOTO_BUCKET).remove([target.photoPath]);
        showToast("지웠어요");
        await loadAll();
    }

    // ---------- 그리기 ----------
    function renderAll() {
        $("[data-me-name]").textContent = state.me ? nameOf(state.me) : "선택 안 함";
        document.querySelectorAll("[data-write-only]").forEach((el) => { el.hidden = !client; });
        renderSchedule();
        renderItems();
    }

    // ---------- 이벤트 (위임) ----------
    document.addEventListener("click", (event) => {
        if (event.target.matches("[data-who]") && state.me) { closeWho(); return; }
        const target = event.target.closest("[data-action]");
        if (!target) return;
        const { action, id, kind } = target.dataset;
        switch (action) {
            case "tab": selectTab(target.dataset.tab); break;
            case "open-who": openWho(); break;
            case "choose-me":
                state.me = id;
                writeLocal(ME_KEY, id);
                closeWho();
                renderAll();
                showToast(nameOf(id) + "님, 반가워요");
                break;
            case "edit-names": openNamesForm(); break;
            case "close-names": $("[data-names-form]").hidden = true; break;
            case "add-event": openEventForm(null); break;
            case "edit-event": openEventForm(id); break;
            case "cancel-event": $("[data-event-form]").hidden = true; break;
            case "add-item": openItemForm(); break;
            case "cancel-item": $("[data-item-form]").hidden = true; break;
            case "done": setDone(id, true); break;
            case "undone": setDone(id, false); break;
            case "pick": pickItem(id, true); break;
            case "unpick": pickItem(id, false); break;
            case "filter":
                state.filter = state.filter === target.dataset.key && MEMBER_IDS.includes(target.dataset.key) ? "all" : target.dataset.key;
                renderItems();
                break;
            case "ask-delete": askDelete(kind, id); break;
            case "confirm-delete": confirmDelete(); break;
            case "cancel-delete": state.deleteTarget = null; renderAll(); break;
            default: break;
        }
    });

    document.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.target;
        if (!client) return;
        if (form.matches("[data-event-form]")) saveEvent(form);
        else if (form.matches("[data-item-form]")) saveItem(form);
        else if (form.matches("[data-names-form]")) saveNames(form);
    });

    document.addEventListener("change", async (event) => {
        if (!event.target.matches("[data-photo-input]")) return;
        const file = event.target.files && event.target.files[0];
        const preview = $("[data-photo-preview]");
        if (!file) { state.pendingPhoto = null; preview.hidden = true; return; }
        state.pendingPhoto = await shrinkImage(file);
        preview.src = URL.createObjectURL(state.pendingPhoto);
        preview.hidden = false;
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !$("[data-who]").hidden && state.me) closeWho();
    });

    // ---------- 시작 ----------
    selectTab(location.hash === "#items" ? "items" : "schedule");
    renderAll();
    if (!client) {
        setNotice("Supabase 연결 설정이 아직 안 됐어요. resource/js/config.js 에 anon 키를 넣어 주세요.");
        return;
    }
    loadAll().then(() => { if (!state.me) openWho(); });
    subscribeChanges();
});
