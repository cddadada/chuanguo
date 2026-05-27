(() => {
  const STORAGE_KEY = "cg_drum_scan_checkin_split_demo_v1";

  const PROCESS_NAMES = [
    "备料",
    "卷制/纵缝",
    "纵缝探伤",
    "环缝",
    "环缝探伤",
    "排孔",
    "一次机加",
    "预焊件",
    "预焊件磁粉探伤",
    "封头环缝",
    "封头探伤",
    "马鞍开孔",
    "下降管焊接",
    "UT管接头",
    "角焊缝探伤",
    "小管接头焊接及探伤",
    "热处理",
    "锅筒复探",
    "水压",
    "二次机加",
    "内部装置",
    "油漆包装",
    "完工",
  ];

  const KEY_PROCESSES = new Set(["纵缝探伤", "环缝探伤", "热处理", "水压", "油漆包装", "完工"]);

  const fallbackMemory = {
    routeSource: { uploaded: false, fileName: "", importedAt: "", orderCode: "", itemName: "" },
    drums: [],
    printJobs: [],
  };

  function safeGet() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function safeSet(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      window.__DRUM_DEMO_MEMORY__ = JSON.parse(value);
    }
  }

  function currentTime() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T08:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function normalizeState(raw) {
    const state = raw && typeof raw === "object" ? raw : {};
    state.routeSource = state.routeSource || { uploaded: false, fileName: "", importedAt: "", orderCode: "", itemName: "" };
    state.drums = Array.isArray(state.drums) ? state.drums : [];
    state.printJobs = Array.isArray(state.printJobs) ? state.printJobs : [];
    return state;
  }

  function loadState() {
    const stored = safeGet();
    if (stored) {
      try {
        return normalizeState(JSON.parse(stored));
      } catch (error) {
        return normalizeState(window.__DRUM_DEMO_MEMORY__ || fallbackMemory);
      }
    }
    return normalizeState(window.__DRUM_DEMO_MEMORY__ || fallbackMemory);
  }

  function saveState(state) {
    safeSet(JSON.stringify(normalizeState(state)));
  }

  function createDrum(orderCode, itemName, fileName) {
    const customer = inferCustomer(itemName);
    const project = inferProject(itemName);
    const drawingNo = orderCode === "410503" ? "410503.001.0" : `${orderCode}.001.0`;
    const tasks = PROCESS_NAMES.map((processName, index) => {
      const sequence = index + 1;
      const plannedStart = addDays("2026-05-20", index);
      const plannedFinish = addDays("2026-05-21", index);
      const isDone = sequence < 4;
      return {
        task_id: `${orderCode}-T${String(sequence).padStart(2, "0")}`,
        process_name: processName,
        process_sequence: sequence,
        planned_start_date: plannedStart,
        planned_finish_date: plannedFinish,
        actual_finish_time: isDone ? `${plannedFinish} 17:30` : "",
        finish_user: isDone ? "扫码工人" : "",
        status: isDone ? "已完成" : sequence === 4 ? "待完成" : "待开始",
        delay_days: 0,
        stagnation_hours: 0,
      };
    });

    return {
      drum_id: `D-${orderCode}`,
      drum_code: `DRUM-${orderCode}-${drawingNo.replaceAll(".", "")}`,
      production_order_no: orderCode,
      customer_name: customer,
      project_name: project,
      drawing_no: drawingNo,
      drum_name: "锅筒",
      factory: "核容分厂",
      source_file: fileName || "工艺路线表.zip",
      planned_finish_date: tasks[tasks.length - 1].planned_finish_date,
      last_checkin_time: tasks[2].actual_finish_time,
      tasks,
      scanRecords: [],
      notifyRecords: [],
    };
  }

  function inferCustomer(itemName) {
    if (!itemName) return "大连西太";
    const compact = itemName.replace(/\s+/g, "");
    if (compact.includes("俄罗斯")) return "俄罗斯 UNIX";
    if (compact.includes("华泰")) return "鞍山华泰新石";
    if (compact.includes("天脊")) return "天脊煤化工";
    return compact.slice(0, 8) || "大连西太";
  }

  function inferProject(itemName) {
    return itemName || "1x150t/h 角管炉";
  }

  function getUploadConflict(orderCode) {
    const state = loadState();
    const normalizedOrder = orderCode || "";
    const drum = state.drums.find((item) => item.production_order_no === normalizedOrder);
    if (!drum) return null;
    const printedCount = state.printJobs.filter((job) => job.drum_id === drum.drum_id).length;
    const completedCount = drum.tasks.filter((task) => task.status === "已完成").length;
    return {
      drum,
      printedCount,
      scanCount: drum.scanRecords.length,
      completedCount,
      completionRate: getCompletionRate(drum),
      currentTask: getCurrentTask(drum),
    };
  }

  function mergeExistingDrum(existingDrum, incomingDrum) {
    const oldTasksByName = new Map(existingDrum.tasks.map((task) => [task.process_name, task]));
    incomingDrum.drum_id = existingDrum.drum_id;
    incomingDrum.drum_code = existingDrum.drum_code;
    incomingDrum.scanRecords = existingDrum.scanRecords;
    incomingDrum.notifyRecords = existingDrum.notifyRecords;
    incomingDrum.last_checkin_time = existingDrum.last_checkin_time;
    incomingDrum.tasks = incomingDrum.tasks.map((newTask) => {
      const oldTask = oldTasksByName.get(newTask.process_name);
      if (!oldTask) return newTask;
      if (oldTask.status === "已完成") {
        return {
          ...newTask,
          actual_finish_time: oldTask.actual_finish_time,
          finish_user: oldTask.finish_user,
          status: oldTask.status,
          delay_days: oldTask.delay_days,
          stagnation_hours: oldTask.stagnation_hours,
        };
      }
      return {
        ...newTask,
        status: oldTask.status,
        actual_finish_time: oldTask.actual_finish_time,
        finish_user: oldTask.finish_user,
      };
    });
    return incomingDrum;
  }

  function uploadRoute({ orderCode, itemName, fileName, mode = "replace" }) {
    const state = loadState();
    const normalizedOrder = orderCode || "1150053";
    const drum = createDrum(normalizedOrder, itemName || "大连西太二期1x150t/h角管炉", fileName);
    const existingIndex = state.drums.findIndex((item) => item.production_order_no === normalizedOrder);
    if (existingIndex >= 0) {
      state.drums[existingIndex] = mode === "safeMerge" ? mergeExistingDrum(state.drums[existingIndex], drum) : drum;
    } else {
      state.drums.unshift(drum);
    }
    state.routeSource = {
      uploaded: true,
      fileName: fileName || "工艺路线表.zip",
      importedAt: currentTime(),
      orderCode: normalizedOrder,
      itemName: itemName || drum.project_name,
    };
    saveState(state);
    return state;
  }

  function ensureSeedIfEmpty() {
    const state = loadState();
    if (!state.drums.length) {
      uploadRoute({ orderCode: "410503", itemName: "鞍山华泰新石项目250t/h干熄焦余热炉", fileName: "001.xls" });
      return loadState();
    }
    return state;
  }

  function getCurrentTask(drum) {
    return drum.tasks.find((task) => task.status !== "已完成") || drum.tasks[drum.tasks.length - 1];
  }

  function getCompletionRate(drum) {
    const done = drum.tasks.filter((task) => task.status === "已完成").length;
    return Math.round((done / drum.tasks.length) * 100);
  }

  function getRisk(drum) {
    const current = getCurrentTask(drum);
    if (current.stagnation_hours > 0 || current.status === "停滞") return { level: "stagnant", label: `停滞 ${current.stagnation_hours || 24}h` };
    if (current.delay_days > 0 || current.status === "延期") return { level: "delay", label: `延期 ${current.delay_days || 1}d` };
    return { level: "normal", label: "正常" };
  }

  function findDrum(idOrCode) {
    const state = ensureSeedIfEmpty();
    return state.drums.find((drum) => drum.drum_code === idOrCode || drum.drum_id === idOrCode || drum.production_order_no === idOrCode) || state.drums[0];
  }

  function printLabel(drumId) {
    const state = ensureSeedIfEmpty();
    const drum = state.drums.find((item) => item.drum_id === drumId) || state.drums[0];
    const job = {
      id: `P-${Date.now()}`,
      drum_id: drum.drum_id,
      drum_code: drum.drum_code,
      printed_at: currentTime(),
    };
    state.printJobs.unshift(job);
    saveState(state);
    return { state, drum, job };
  }

  function completeCurrentTask(idOrCode) {
    const state = ensureSeedIfEmpty();
    const drum = state.drums.find((item) => item.drum_code === idOrCode || item.drum_id === idOrCode || item.production_order_no === idOrCode) || state.drums[0];
    const task = getCurrentTask(drum);
    task.status = "已完成";
    task.actual_finish_time = currentTime();
    task.finish_user = "扫码工人";
    task.delay_days = 0;
    task.stagnation_hours = 0;
    drum.last_checkin_time = task.actual_finish_time;
    drum.scanRecords.unshift({
      record_id: `R-${Date.now()}`,
      drum_code: drum.drum_code,
      process_name: task.process_name,
      action_type: "finish",
      scan_time: task.actual_finish_time,
    });
    if (KEY_PROCESSES.has(task.process_name)) {
      drum.notifyRecords.unshift({
        notify_id: `N-${Date.now()}`,
        message: `${drum.customer_name} ${drum.project_name}：${drum.drum_name}${task.process_name}完成。`,
        notify_time: task.actual_finish_time,
      });
    }
    const next = getCurrentTask(drum);
    if (next.task_id !== task.task_id && next.status === "待开始") next.status = "待完成";
    saveState(state);
    return { state, drum, task, next };
  }

  function savePlanDates(drumId, rows) {
    const state = ensureSeedIfEmpty();
    const drum = state.drums.find((item) => item.drum_id === drumId) || state.drums[0];
    rows.forEach((row) => {
      const task = drum.tasks.find((item) => item.task_id === row.task_id);
      if (!task) return;
      task.planned_start_date = row.planned_start_date;
      task.planned_finish_date = row.planned_finish_date;
    });
    drum.planned_finish_date = drum.tasks[drum.tasks.length - 1].planned_finish_date;
    saveState(state);
    return { state, drum };
  }

  window.DrumDemo = {
    PROCESS_NAMES,
    loadState,
    saveState,
    uploadRoute,
    getUploadConflict,
    ensureSeedIfEmpty,
    getCurrentTask,
    getCompletionRate,
    getRisk,
    findDrum,
    printLabel,
    completeCurrentTask,
    savePlanDates,
    currentTime,
  };
})();
