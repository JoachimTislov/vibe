local M = {}
local options = { command = { "agent", "local", "--json" } }

function M.setup(opts)
  options = vim.tbl_extend("force", options, opts or {})
end

function M.ask(prompt, callback)
  local partial = ""
  local errors = {}
  local finished = false
  local job
  local function send(value)
    vim.fn.chansend(job, vim.json.encode(value) .. "\n")
  end
  local function event(value)
    if value.type == "approval" then
      vim.ui.select({ "Deny", "Approve" }, { prompt = value.text }, function(choice)
        if not finished then
          send({ approval_id = value.approval_id, approved = choice == "Approve" })
        end
      end)
    elseif value.type == "reply" then
      finished = true
      if callback then
        callback(value.text, value.error)
      else
        vim.cmd("botright new")
        local buffer = vim.api.nvim_get_current_buf()
        vim.bo[buffer].buftype = "nofile"
        vim.bo[buffer].bufhidden = "wipe"
        vim.bo[buffer].swapfile = false
        vim.api.nvim_buf_set_lines(buffer, 0, -1, false, vim.split(value.text, "\n"))
        vim.bo[buffer].modifiable = false
      end
      vim.fn.chanclose(job, "stdin")
    end
  end
  job = vim.fn.jobstart(options.command, {
    on_stdout = function(_, data)
      for i, part in ipairs(data) do
        partial = partial .. part
        if i < #data then
          local line = partial
          partial = ""
          if line ~= "" then
            local ok, value = pcall(vim.json.decode, line)
            if ok then
              vim.schedule(function() event(value) end)
            else
              table.insert(errors, "Invalid JSON from agent")
            end
          end
        end
      end
    end,
    on_stderr = function(_, data)
      for _, line in ipairs(data) do
        if line ~= "" then table.insert(errors, line) end
      end
    end,
    on_exit = function(_, code)
      if not finished then
        finished = true
        vim.schedule(function()
          local message = table.concat(errors, "\n")
          if message == "" then message = "Agent exited before replying (" .. code .. ")" end
          if callback then callback(message, "client_failed") else vim.notify(message, vim.log.levels.ERROR) end
        end)
      end
    end,
  })
  if job <= 0 then error("Could not start agent CLI") end
  send({ text = prompt, conversation = "neovim" })
  return job
end

vim.api.nvim_create_user_command("Agent", function(opts)
  local selection = ""
  if opts.range > 0 then
    selection = "\n\n" .. table.concat(vim.api.nvim_buf_get_lines(0, opts.line1 - 1, opts.line2, false), "\n")
  end
  if opts.args ~= "" then M.ask(opts.args .. selection) else
    vim.ui.input({ prompt = "Agent: " }, function(text)
      if text and text ~= "" then M.ask(text .. selection) end
    end)
  end
end, { nargs = "*", range = true, force = true })

return M
