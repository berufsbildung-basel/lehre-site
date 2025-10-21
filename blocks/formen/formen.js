import { getLibs } from '../../scripts/scripts.js';

/* global turnstile */

const RULE_OPERATORS = {
  equal: '=',
  notEqual: '!=',
  lessThan: '<',
  lessThanOrEqual: '<=',
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  includes: 'inc',
  excludes: 'exc',
};

// eslint-disable-next-line no-unused-vars
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB limit

const miloLibs = getLibs();
const { createTag } = await import(`${miloLibs}/utils/utils.js`);

function loadTurnstile() {
  if (!document.getElementById('cf-turnstile-script')) {
    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
}
loadTurnstile();

function createSelect({ field, placeholder, options, defval, required }) {
  const select = createTag('select', { id: field });
  const placeholderText = placeholder || 'Bitte wählen';
  select.append(createTag('option', { selected: '', disabled: '', value: '' }, placeholderText));
  options.split(',').forEach((o) => {
    const text = o.trim();
    const option = createTag('option', { value: text }, text);
    select.append(option);
    if (defval === text) select.value = text;
  });
  if (required === 'x') select.setAttribute('required', 'required');
  return select;
}

function constructPayload(form) {
  const payload = {};
  const files = {};

  // checks all the form elements so it can add them to the payload after
  [...form.elements].filter((el) => el.tagName !== 'BUTTON').forEach((fe) => {
    if (fe.type === 'file') {
      if (fe.files && fe.files.length > 0) {
        files[fe.id] = Array.from(fe.files);
      }
      return; // file inputs dont get added to the regular payload
    }

    if (fe.type.match(/(?:checkbox|radio)/)) {
      if (fe.checked) {
        payload[fe.name] = payload[fe.name] ? `${fe.value}, ${payload[fe.name]}` : fe.value;
      } else {
        payload[fe.name] = payload[fe.name] || '';
      }
      return;
    }

    // makes sure that only non-file inputs get added to the payload
    if (fe.id && fe.type !== 'file') {
      payload[fe.id] = fe.value;
    }
  });

  // checks for file inputs that might not be in form.elements
  const fileInputs = form.querySelectorAll('input[type="file"]');

  fileInputs.forEach((input) => {
    if (input.files && input.files.length > 0 && input.id) {
      files[input.id] = Array.from(input.files);
      // remove files from the payload if it was added there
      delete payload[input.id];
    }
  });

  return { payload, files };
}

async function submitForm(formOrPayload) {
  let payload; let
    files;

  if (formOrPayload instanceof HTMLFormElement) {
    const formData = constructPayload(formOrPayload);
    payload = formData.payload;
    files = formData.files;
  } else {
    payload = formOrPayload;
    files = {};
  }

  payload.timestamp = new Date().toISOString();

  const hasFiles = Object.keys(files).length > 0;

  try {
    let response;

    if (hasFiles) {
      // creates FormData for multipart form submission (files need different format than JSON)
      const formData = new FormData();

      // adds form fields
      Object.keys(payload).forEach((key) => {
        formData.append(key, payload[key]);
      });

      Object.keys(files).forEach((fieldName) => {
        files[fieldName].forEach((file, index) => {
          formData.append(`${fieldName}_${index}`, file, file.name);
        });
      });

      // adds the file count in the payload of the form
      Object.keys(files).forEach((fieldName) => {
        formData.append(`${fieldName}_count`, files[fieldName].length.toString());
      });

      response = await fetch('https://submission-worker.main--lehre-site--berufsbildung-basel.workers.dev', {
        method: 'POST',
        body: formData,
      });
    } else {
      response = await fetch('https://submission-worker.main--lehre-site--berufsbildung-basel.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    // eslint-disable-next-line no-console
    console.log('POST request successful:', {
      status: response.status,
      statusText: response.statusText,
      payload,
      fileCount: Object.keys(files).reduce((count, key) => count + files[key].length, 0),
    });

    const result = await response.json();
    // eslint-disable-next-line no-console
    console.log('Response from server:', result);
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Form submission failed:', error);
    return { status: 'error', message: error.message };
  }
}

function clearForm(form) {
  [...form.elements].forEach((fe) => {
    if (fe.type.match(/(?:checkbox|radio)/)) {
      fe.checked = false;
    } else {
      fe.value = '';
    }
  });
}

function getTotalSteps(form) {
  return form.querySelectorAll('.form-step').length;
}

function validateCurrentStep(form, step) {
  const stepElement = form.querySelector(`[data-step="${step}"]`);
  const requiredFields = stepElement.querySelectorAll('[required]');

  let valid = true;
  requiredFields.forEach((field) => {
    if (!field.checkValidity()) {
      field.reportValidity();
      valid = false;
    }
  });

  return valid;
}

function saveFormDataToSession(form) {
  const formData = constructPayload(form);
  sessionStorage.setItem(`formData_${form.dataset.action}`, JSON.stringify(formData));
}

// submit button: two-step process (1. load captcha, 2. submit form)
function createButton({ type, label }, thankYou) {
  const button = createTag('button', { class: 'button' }, label);

  if (type === 'submit') {
    button.addEventListener('click', async (event) => {
      const form = button.closest('form');
      const currentStep = parseInt(form.dataset.currentStep || '1', 10);
      const totalSteps = getTotalSteps(form);

      // validates current step before proceeding
      if (!validateCurrentStep(form, currentStep)) {
        event.preventDefault();
        return;
      }

      // validates current step and navigates to next (if not last step)
      if (currentStep < totalSteps) {
        event.preventDefault();
        saveFormDataToSession(form);
        // eslint-disable-next-line no-use-before-define
        navigateStep(form, currentStep + 1);
        return;
      }

      // loads captcha after filling data out in final step and pressing submit button
      if (form.checkValidity()) {
        event.preventDefault();

        if (!form.querySelector('.cf-turnstile')) {
          const captchaDiv = createTag('div', { class: 'cf-turnstile' });
          form.appendChild(captchaDiv);

          turnstile.render(captchaDiv, {
            sitekey: '0x4AAAAAAA6uqp_nGspHkBq3',
            theme: 'light',
            callback: async (token) => {
              form.dataset.turnstileToken = token;
              button.removeAttribute('disabled');
            },
          });

          button.setAttribute('disabled', 'true');
          return;
        }

        const token = form.dataset.turnstileToken;
        if (!token) {
          // eslint-disable-next-line no-console
          console.error('Captcha not completed');
          return;
        }

        button.setAttribute('disabled', '');
        const formData = constructPayload(form);
        formData.payload.turnstileToken = token; // includes turnstile token in the form payload

        const submission = await submitForm(form);
        button.removeAttribute('disabled');

        if (!submission) return;
        clearForm(form);

        // Hide/remove turnstile widget after successful submission
        const turnstileWidget = form.querySelector('.cf-turnstile');
        if (turnstileWidget) {
          turnstileWidget.remove();
        }

        // clears session storage after successful submission
        sessionStorage.removeItem(`formData_${form.dataset.action}`);

        // might replace this with something else later on, but will leave it for now

        const handleThankYou = thankYou.querySelector('a') ? thankYou.querySelector('a').href : thankYou.innerHTML;
        if (!thankYou.innerHTML.includes('href')) {
          const thanksText = createTag('h4', { class: 'thank-you' }, handleThankYou);
          form.append(thanksText);
          setTimeout(() => thanksText.remove(), 2000);
        } else {
          window.location.href = handleThankYou;
        }
      }
    });
  }
  return button;
}

function createHeading({ label }, el) {
  return createTag(el, {}, label);
}

function createInput({
  type, field, placeholder, required, defval, format,
}) {
  const input = createTag('input', { type, id: field, placeholder, value: defval && defval !== 'undefined' ? defval : '' });

  if (format && format.trim()) {
    input.setAttribute('pattern', format);
    // these are for the verification of the proper input formats
    if (field === 'number') {
      input.setAttribute('title', 'Please enter a valid phone number');
    } else if (type === 'email') {
      input.setAttribute('title', 'Please enter a valid email address');
    } else {
      input.setAttribute('title', 'Please match the required format');
    }
  }
  // this takes care of the max limit of the date so you cant set a birth date in the future
  if (type === 'date') {
    const today = new Date().toISOString().split('T')[0];
    input.setAttribute('max', today);
  }

  if (required === 'x') input.setAttribute('required', 'required');
  return input;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function createFileInput({ field, required }) {
  const wrapper = createTag('div', { class: 'file-upload-wrapper' });

  let acceptTypes = '.pdf';
  if (field === 'profilePicture') {
    acceptTypes = '.jpg,.jpeg,.png,.gif,.webp';
  }

  const input = createTag('input', { type: 'file', id: field, multiple: true, accept: acceptTypes });
  if (required === 'x') input.setAttribute('required', 'required');

  const dropZone = createTag('div', { class: 'file-drop-zone' });
  const attachButton = createTag('button', { type: 'button', class: 'attach-file-btn' }, 'Attach file');
  const dropTextContent = field === 'profilePicture' ? 'Drop images here (JPG, PNG, GIF)' : 'Drop PDF files here';
  const dropText = createTag('span', { class: 'drop-text' }, dropTextContent);

  dropZone.append(attachButton, dropText);

  // error message container for the CSS styling
  const errorMessage = createTag('div', { class: 'file-error-message' });

  // displays the files which are attached to the form
  const fileList = createTag('div', { class: 'file-list' });

  function showErrorMessage(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 4000); // set it to hide the error message after four seconds
  }

  attachButton.addEventListener('click', () => input.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  function updateFileList() {
    fileList.innerHTML = '';
    Array.from(input.files).forEach((file, index) => {
      const fileItem = createTag('div', { class: 'file-item' });
      const fileName = createTag('span', { class: 'file-name' }, file.name);
      const fileSize = createTag('span', { class: 'file-size' }, formatFileSize(file.size));
      const removeBtn = createTag('button', { type: 'button', class: 'remove-file' }, '×');

      removeBtn.addEventListener('click', () => {
        const dt = new DataTransfer();
        Array.from(input.files).forEach((f, i) => {
          if (i !== index) dt.items.add(f);
        });
        input.files = dt.files;
        updateFileList();
      });

      fileItem.append(fileName, fileSize, removeBtn);
      fileList.append(fileItem);
    });
  }

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    // checks if the files are the correct type
    const files = Array.from(e.dataTransfer.files);
    const invalidFiles = files.filter((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      return field === 'profilePicture'
        ? !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
        : ext !== 'pdf';
    });

    if (invalidFiles.length > 0) {
      showErrorMessage(`Invalid file type. Only ${field === 'profilePicture' ? 'images' : 'PDFs'} allowed.`);
      return;
    }

    input.files = e.dataTransfer.files;
    updateFileList();
  });

  input.addEventListener('change', (e) => {
    const invalidFiles = Array.from(e.target.files).filter((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      return field === 'profilePicture'
        ? !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
        : ext !== 'pdf';
    });

    if (invalidFiles.length > 0) {
      showErrorMessage(`Invalid file type. Only ${field === 'profilePicture' ? 'images' : 'PDFs'} allowed.`);
      e.target.value = ''; // clears the files from the input field
    }

    updateFileList();
  });

  wrapper.append(input, dropZone, errorMessage, fileList);
  return wrapper;
}

function navigateStep(form, targetStep) {
  // hides the steps
  form.querySelectorAll('.form-step').forEach((step) => {
    step.style.display = 'none';
  });

  // shows target step
  const targetStepElement = form.querySelector(`[data-step="${targetStep}"]`);
  if (targetStepElement) {
    targetStepElement.style.display = 'block';
  }

  // updates the step indicator (shows current step and progress bar)
  const indicator = form.querySelector('.step-indicator');
  if (indicator) {
    const steps = indicator.querySelectorAll('.step');
    steps.forEach((step, index) => {
      step.classList.toggle('active', index < targetStep);
    });

    const progressFill = indicator.querySelector('.progress-fill');
    const progressPercent = ((targetStep - 1) / (steps.length - 1)) * 100;
    progressFill.style.width = `${progressPercent}%`;
  }

  // updates navigation buttons
  const navigation = form.querySelector('.step-navigation');
  if (navigation) {
    // eslint-disable-next-line no-use-before-define
    navigation.replaceWith(createStepNavigation(targetStep, getTotalSteps(form), form));
  }

  // populates summary if navigating to step 4
  if (targetStep === 4) {
    // eslint-disable-next-line no-use-before-define
    populateSummary(form);
  }

  if (window.innerWidth < 1200) {
    form.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  // stores current step
  form.dataset.currentStep = targetStep;
}

function createStepIndicator(totalSteps, currentStep) {
  const wrapper = createTag('div', { class: 'step-indicator' });
  const progressLine = createTag('div', { class: 'progress-line' });
  const progressFill = createTag('div', { class: 'progress-fill' });
  progressLine.append(progressFill);

  const stepsWrapper = createTag('div', { class: 'steps-wrapper' });

  for (let i = 1; i <= totalSteps; i += 1) {
    const step = createTag('div', { class: `step ${i <= currentStep ? 'active' : ''}` });
    const stepNumber = createTag('span', { class: 'step-number' }, i.toString());
    step.append(stepNumber);
    stepsWrapper.append(step);
  }

  wrapper.append(progressLine, stepsWrapper);
  return wrapper;
}

function createStepNavigation(currentStep, totalSteps, formElement) {
  const wrapper = createTag('div', { class: 'step-navigation' });

  if (currentStep > 1) {
    const backBtn = createTag('button', { type: 'button', class: 'step-btn step-back' }, 'Zurück');
    backBtn.addEventListener('click', () => navigateStep(formElement, currentStep - 1));
    wrapper.append(backBtn);
  }

  if (currentStep < totalSteps) {
    const nextBtn = createTag('button', { type: 'button', class: 'step-btn step-next' }, 'Weiter');
    nextBtn.addEventListener('click', () => {
      if (validateCurrentStep(formElement, currentStep)) {
        saveFormDataToSession(formElement);
        navigateStep(formElement, currentStep + 1);
      }
    });
    wrapper.append(nextBtn);
  }

  return wrapper;
}

const stepMapping = {
    gender: 1,
    firstName: 1,
    lastName: 1,
    birth: 1,
    email: 1,
    number: 1,
    cv: 2,
    profilePicture: 2,
    motivation: 2,
    motivationText: 2,
    certificates: 3,
    multicheck: 3,
    additionalDocs: 3,
    projectUrls: 3,
    additionalMessage: 3
};

function createEditButton(fieldName, form) {
  const targetStep = stepMapping[fieldName];

  if (!targetStep) {
    console.warn(`No step mapping found for this field: ${fieldName}`);
    return createTag('span');
  }

  const editBtn = createTag('button', {
    type: 'button',
    class: 'edit-field-btn',
    title: `Edit ${fieldName}`,
    'data-field': fieldName,
    'data-target-step': targetStep,
  });

  editBtn.addEventListener('click', (e) => {
    e.preventDefault();
    saveFormDataToSession(form);
    navigateStep(form, targetStep);
  });

  return editBtn;
}

function populateSummary(form) {
  // gets all form data
  const formData = constructPayload(form);
  const { payload, files } = formData;

  // populates text and select summary fields
  const summaryMappings = {
    summaryGender: 'gender',
    summaryFirstName: 'firstName',
    summaryLastName: 'lastName',
    summaryBirth: 'birth',
    summaryEmail: 'email',
    summaryNumber: 'number',
    summaryMotivationText: 'motivationText',
    summaryProjectUrls: 'projectUrls',
    summaryAdditionalMessage: 'additionalMessage',
  };

  // populates text fields
  Object.keys(summaryMappings).forEach((summaryField) => {
    const originalField = summaryMappings[summaryField];
    const summaryElement = form.querySelector(`#${summaryField}_display`);
    if (summaryElement) {
      const value = payload[originalField] || '-';

      summaryElement.innerHTML = '';

      const valueSpan = createTag('span', { class: 'summary-text' }, value);
      const editBtn = createEditButton(originalField, form);

      summaryElement.appendChild(valueSpan);
      summaryElement.appendChild(editBtn);
    }
  });

  // populates file summary fields
  const fileSummaryMappings = {
    summaryCv: 'cv',
    summaryProfilePicture: 'profilePicture',
    summaryMotivation: 'motivation',
    summaryCertificates: 'certificates',
    summaryMulticheck: 'multicheck',
    summaryAdditionalDocs: 'additionalDocs',
  };

  Object.keys(fileSummaryMappings).forEach((summaryField) => {
    const originalField = fileSummaryMappings[summaryField];
    const summaryElement = form.querySelector(`#${summaryField}_display`);
    if (summaryElement) {
      const fileIndicator = summaryElement.querySelector('.file-summary-indicator');

      let statusText;
      let hasFiles = false;
      if (files[originalField]?.length > 0) {
        const fileCount = files[originalField].length;
        const fileNames = files[originalField].map((f) => f.name).join(', ');
        statusText = `${fileCount} file(s): ${fileNames}`;
        hasFiles = true;
      } else {
        statusText = 'No files attached';
        hasFiles = false;
      }

      // Clear existing classes and content
      fileIndicator.classList.remove('file-status-has-files', 'file-status-no-files');
      fileIndicator.innerHTML = '';
      // Add appropriate CSS class for styling
      fileIndicator.classList.add(hasFiles ? 'file-status-has-files' : 'file-status-no-files');
      const textSpan = createTag('span', { class: 'file-status-text' }, statusText);
      const editBtn = createEditButton(originalField, form);

      fileIndicator.appendChild(textSpan);
      fileIndicator.appendChild(editBtn);
    }
  });
}

function loadFormDataFromSession(form) {
  const savedData = sessionStorage.getItem(`formData_${form.dataset.action}`);
  if (savedData) {
    const data = JSON.parse(savedData);
    Object.keys(data).forEach((key) => {
      const field = form.querySelector(`#${key}`);
      if (field && field.type !== 'file') {
        if (field.type === 'checkbox' || field.type === 'radio') {
          field.checked = data[key].includes(field.value);
        } else {
          field.value = data[key];
        }
      }
    });
  }
}

function createTextArea({ field, placeholder, required, defval }) {
  const input = createTag('textarea', { id: field, placeholder, value: defval });
  if (required === 'x') input.setAttribute('required', 'required');
  return input;
}

function createSummaryField({ field, required }) {
  const div = createTag('div', {
    class: 'summary-value',
    'data-summary-for': field.replace('summary', '').toLowerCase(),
    id: `${field}_display`,
  });
  div.textContent = '—'; // placeholder until populated

  if (required === 'x') {
    div.classList.add('required-field');
  }

  return div;
}

function createFileSummaryField({ field, required }) {
  const div = createTag('div', {
    class: 'file-summary-value',
    'data-summary-for': field.replace('summary', '').toLowerCase(),
    id: `${field}_display`,
  });

  const fileIndicator = createTag('div', { class: 'file-summary-indicator' });
  fileIndicator.innerHTML = 'No files attached';
  div.append(fileIndicator);

  if (required === 'x') {
    div.classList.add('required-field');
  }

  return div;
}

function createlabel({ field, label, required }) {
  return createTag('label', { for: field, class: required ? 'required' : '' }, label);
}

function createCheckItem(item, type, id, def) {
  const itemKebab = item.toLowerCase().replaceAll(' ', '-');
  const defList = def.split(',').map((defItem) => defItem.trim());
  const pseudoEl = createTag('span', { class: `check-item-button ${type}-button` });
  const label = createTag('label', { class: `check-item-label ${type}-label`, for: `${id}-${itemKebab}` }, item);
  const input = createTag(
    'input',
    { type, name: id, value: item, class: `check-item-input ${type}-input`, id: `${id}-${itemKebab}` },
  );
  if (item && defList.includes(item)) input.setAttribute('checked', '');
  return createTag('div', { class: `check-item-wrap ${type}-input-wrap` }, [input, pseudoEl, label]);
}

function createCheckGroup({ options, field, defval, required }, type) {
  const optionsMap = options.split(',').map((item) => createCheckItem(item.trim(), type, field, defval));
  return createTag(
    'div',
    { class: `group-container ${type}-group-container${required === 'x' ? ' required' : ''}` },
    optionsMap,
  );
}

function processNumRule(tf, operator, a, b) {
  /* c8 ignore next 3 */
  if (!tf.dataset.type.match(/(?:number|date)/)) {
    throw new Error(`Comparison field must be of type number or date for ${operator} rules`);
  }
  const { type } = tf.dataset;
  const a2 = type === 'number' ? parseInt(a, 10) : Date.parse(a);
  const b2 = type === 'number' ? parseInt(b, 10) : Date.parse(b);
  return [a2, b2];
}

function processRule(tf, operator, payloadKey, value, comparisonFunction) {
  if (payloadKey === '') return true;
  try {
    const [a, b] = processNumRule(tf, operator, payloadKey, value);
    return comparisonFunction(a, b);
    /* c8 ignore next 5 */
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`Invalid rule, ${e}`);
    return false;
  }
}

function applyRules(form, rules) {
  const payload = constructPayload(form);
  rules.forEach((field) => {
    const { type, condition: { key, operator, value } } = field.rule;
    const fw = form.querySelector(`[data-field-id=${field.fieldId}]`);
    const tf = form.querySelector(`[data-field-id=${key}]`);
    let force = false;
    switch (operator) {
      case RULE_OPERATORS.equal:
        force = (payload[key] === value);
        break;
      case RULE_OPERATORS.notEqual:
        force = (payload[key] !== value);
        break;
      case RULE_OPERATORS.includes:
        force = (payload[key].split(',').map((s) => s.trim()).includes(value));
        break;
      case RULE_OPERATORS.excludes:
        force = (!payload[key].split(',').map((s) => s.trim()).includes(value));
        break;
      case RULE_OPERATORS.lessThan:
        force = processRule(tf, operator, payload[key], value, (a, b) => a < b);
        break;
      case RULE_OPERATORS.lessThanOrEqual:
        force = processRule(tf, operator, payload[key], value, (a, b) => a <= b);
        break;
      case RULE_OPERATORS.greaterThan:
        force = processRule(tf, operator, payload[key], value, (a, b) => a > b);
        break;
      case RULE_OPERATORS.greaterThanOrEqual:
        force = processRule(tf, operator, payload[key], value, (a, b) => a >= b);
        break;
      default:
        // eslint-disable-next-line no-console
        console.warn(`Unsupported operator ${operator}`);
        return false;
    }
    fw.classList.toggle(type, force);
    return false;
  });
}

function lowercaseKeys(obj) {
  return Object.keys(obj).reduce((acc, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'default') {
      acc.defval = obj[key];
    } else if (lowerKey === 'mandatory') {
      acc.required = obj[key];
    } else {
      acc[lowerKey] = obj[key];
    }
    return acc;
  }, {});
}

async function createForm(formURL, thankYou, formData) {
  const { pathname } = new URL(formURL);
  let json = formData;
  /* c8 ignore next 4 */
  if (!formData) {
    const resp = await fetch(pathname);
    json = await resp.json();
  }
  json.data = json.data.map((obj) => lowercaseKeys(obj));
  const form = createTag('form');
  const rules = [];
  const [action] = pathname.split('.json');
  form.dataset.action = action;

  const typeToElement = {
    select: { fn: createSelect, params: [], label: true, classes: [] },
    heading: { fn: createHeading, params: ['h3'], label: false, classes: [] },
    legal: { fn: createHeading, params: ['p'], label: false, classes: [] },
    checkbox: { fn: createCheckGroup, params: ['checkbox'], label: true, classes: ['field-group-wrapper'] },
    'checkbox-group': { fn: createCheckGroup, params: ['checkbox'], label: true, classes: ['field-group-wrapper'] },
    'radio-group': { fn: createCheckGroup, params: ['radio'], label: true, classes: ['field-group-wrapper'] },
    'text-area': { fn: createTextArea, params: [], label: true, classes: [] },
    file: { fn: createFileInput, params: [], label: true, classes: ['field-file-wrapper'] },
    summary: { fn: createSummaryField, params: [], label: true, classes: ['summary-field'] },
    'file-summary': { fn: createFileSummaryField, params: [], label: true, classes: ['file-summary-field'] },
    submit: { fn: createButton, params: [thankYou], label: false, classes: ['field-button-wrapper'] },
    clear: { fn: createButton, params: [thankYou], label: false, classes: ['field-button-wrapper'] },
    default: { fn: createInput, params: [], label: true, classes: [] },
  };

  // Group fields by steps if extra contains step info
  const steps = {};
  let currentStepData = null;
  let stepCounter = 1;

  json.data.forEach((fd) => {
    fd.type = fd.type || 'text';

    // Determine step based on extra field or position
    let stepNumber = 1;
    if (fd.extra && fd.extra.includes('step-')) {
      stepNumber = parseInt(fd.extra.match(/step-(\d+)/)[1], 10) || stepCounter;
    } else if (currentStepData && currentStepData.stepNumber) {
      stepNumber = currentStepData.stepNumber;
    } else {
      stepNumber = stepCounter;
    }

    if (!steps[stepNumber]) {
      steps[stepNumber] = [];
      stepCounter = stepNumber + 1;
    }

    currentStepData = { stepNumber, field: fd };
    steps[stepNumber].push(fd);
  });

  const totalSteps = Object.keys(steps).length;

  // Create step indicator if more than one step
  if (totalSteps > 1) {
    form.append(createStepIndicator(totalSteps, 1));
  }

  // Create steps
  Object.keys(steps).forEach((stepNum) => {
    const stepNumber = parseInt(stepNum, 10);
    const stepWrapper = createTag('div', {
      class: 'form-step',
      'data-step': stepNumber,
      style: stepNumber === 1 ? 'block' : 'none',
    });

    steps[stepNum].forEach((fd) => {
      const style = fd.extra ? ` form-${fd.extra}` : '';
      const fieldWrapper = createTag(
        'div',
        { class: `field-wrapper form-${fd.type}-wrapper${style}`, 'data-field-id': fd.field, 'data-type': fd.type },
      );

      const elParams = typeToElement[fd.type] || typeToElement.default;
      if (elParams.label) fieldWrapper.append(createlabel(fd));
      fieldWrapper.append(elParams.fn(fd, ...elParams.params));
      fieldWrapper.classList.add(...elParams.classes);

      if (fd.rules?.length) {
        try {
          rules.push({ fieldId: fd.field, rule: JSON.parse(fd.rules) });
          /* c8 ignore next 4 */
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`Invalid Rule ${fd.rules}: ${e}`);
        }
      }
      stepWrapper.append(fieldWrapper);
    });

    // Add step navigation if more than one step
    if (totalSteps > 1) {
      stepWrapper.append(createStepNavigation(stepNumber, totalSteps, form));
    }

    form.append(stepWrapper);
  });

  // Set initial step
  form.dataset.currentStep = '1';

  form.addEventListener('input', () => applyRules(form, rules));
  applyRules(form, rules);

  // Load saved form data from session if available
  loadFormDataFromSession(form);

  return form;
}

export default async function decorate(block, formData = null) {
  const form = block.querySelector('a[href$=".json"]');
  const thankYou = block.querySelector(':scope > div:last-of-type > div');
  thankYou.remove();
  if (form) form.replaceWith(await createForm(form.href, thankYou, formData));
}
