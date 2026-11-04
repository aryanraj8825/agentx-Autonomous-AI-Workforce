# Wiring the frontend store to the backend

`AppStore.jsx` already keeps tasks in one reducer. To go live:

1. **Remove** the `setInterval` TICK effect and `seedTasks()`; load with
   `api.listTasks()` on login, and `api.getTask(id)` when `/tasks/:id` opens (it includes `logs` and `messages`).
2. **Add reducer cases** for socket events:

```js
case 'WS_TASK_UPDATED': {            // ev.task has everything except logs/messages
  const i = s.tasks.findIndex((t) => t.id === a.task.id);
  const prev = s.tasks[i];
  const merged = { logs: [], messages: [], ...prev, ...a.task };
  return { ...s, tasks: i < 0 ? [merged, ...s.tasks] : s.tasks.map((t, j) => (j === i ? merged : t)) };
}
case 'WS_LOG': return { ...s, tasks: s.tasks.map((t) => t.id === a.taskId && !t.logs.some((l) => l.id === a.log.id) ? { ...t, logs: [...t.logs, a.log] } : t) };
case 'WS_MESSAGE': return { ...s, tasks: s.tasks.map((t) => t.id === a.taskId && !t.messages.some((m) => m.id === a.message.id) ? { ...t, messages: [...t.messages, a.message] } : t) };
case 'WS_NOTIFICATION': return addNotice(s, a.notification);
```

3. **Subscribe** once after login:

```js
useEffect(() => state.user ? connectEvents((ev) => {
  if (ev.type === 'task.updated') dispatch({ type: 'WS_TASK_UPDATED', task: ev.task });
  if (ev.type === 'log.added') dispatch({ type: 'WS_LOG', taskId: ev.taskId, log: ev.log });
  if (ev.type === 'message.added') dispatch({ type: 'WS_MESSAGE', taskId: ev.taskId, message: ev.message });
  if (ev.type === 'notification') dispatch({ type: 'WS_NOTIFICATION', notification: ev.notification });
}) : undefined, [state.user]);
```

4. **Actions** call the API instead of dispatching locally: `createTask` → `api.createTask`, `approve/reject/cancel/retry` → matching calls
   (the server then pushes `task.updated`). In `Deliverables`, replace the local `download(...)` with `api.downloadFile(task.id, d.name)`.
5. **Login**: `const { token, user } = await api.login(email, password); setToken(token); login(user)`.
6. Task fields differ only by additions: `error`, `summary`, `sharedState` (detail only), node `params`. Deliverable kinds now include `pdf` and `xlsx`.
