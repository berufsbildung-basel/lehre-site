import { getLibs } from '../../scripts/scripts.js';

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

const miloLibs = getLibs();
const {createTag} = await import(`${miloLibs}/utils/utils.js`);

function loadTurnstile() {
    if (!document.getElementById('cf-turnstile-script')) {
        const script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
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
  
  fileInputs.forEach(input => {
    if (input.files && input.files.length > 0 && input.id) {
      files[input.id] = Array.from(input.files);
      // remove files from the payload if it was added there
      delete payload[input.id];
    }
  });
  
  return { payload, files };
}

async function submitForm(formOrPayload) {
  let payload, files;
  
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
      // creates FormData for multipart form submission, this is needed because the form data gets sent in json and the files need to be sent in an other format
      const formData = new FormData();
      
      // adds form fields
      Object.keys(payload).forEach(key => {
        formData.append(key, payload[key]);
      });
      
     files
      Object.keys(files).forEach(fieldName => {
        files[fieldName].forEach((file, index) => {
          formData.append(`${fieldName}_${index}`, file, file.name);
        });
      });
      
      // adds the file count in the payload of the form
      Object.keys(files).forEach(fieldName => {
        formData.append(`${fieldName}_count`, files[fieldName].length.toString());
      });

      response = await fetch('https://submission-worker.main--lehre-site--berufsbildung-basel.workers.dev', {
        method: 'POST',
        body: formData,
      });
    } else {
      response = await fetch('https://submission-worker.main--lehre-site--berufsbildung-basel.workers.dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    console.log('POST request successful:', {
      status: response.status,
      statusText: response.statusText,
      payload,
      fileCount: Object.keys(files).reduce((count, key) => count + files[key].length, 0)
    });

    const result = await response.json();
    console.log('Response from server:', result);
    return result;
  } catch (error) {
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

// currently the submit button works in a two step process of first loading the captcha and after the captcha you press it again to actually submit the form
// lines 175-191 are actually meant for the multiple steps of the form application page but is currently not properly in use

function createButton({ type, label }, thankYou) {
  const button = createTag('button', { class: 'button' }, label);

  if (type === 'submit') {
    button.addEventListener('click', async (event) => {
      const form = button.closest('form');
      const currentStep = parseInt(form.dataset.currentStep || '1');
      const totalSteps = getTotalSteps(form);

      // Validate current step before proceeding
      if (!validateCurrentStep(form, currentStep)) {
        event.preventDefault();
        return;
      }

      // if its not the last step it validates/ processes the current step and navigates to the next one (could also use a different method for proceeding to the next step)
      if (currentStep < totalSteps) {
        event.preventDefault();
        saveFormDataToSession(form);
        navigateStep(form, currentStep + 1);
        return;
      }

      // this is the part where the captcha is loaded after filling data out in the final step and pressing the submit button
      if (form.checkValidity()) {
        event.preventDefault();

        if (!form.querySelector('.cf-turnstile')) {
          const captchaDiv = createTag('div', { class: 'cf-turnstile' });
          form.appendChild(captchaDiv);
        
          turnstile.render(captchaDiv, {
            sitekey: '0x4AAAAAAA6uqp_nGspHkBq3',
            theme: 'light',
            callback: async (token) => {
              console.log('Turnstile token:', token);
              form.dataset.turnstileToken = token;
              button.removeAttribute('disabled');
            }
          });
        
          button.setAttribute('disabled', 'true');
          return;
        }        

        const token = form.dataset.turnstileToken;
        if (!token) {
          console.error('Captcha not completed');
          return;
        }

        button.setAttribute('disabled', '');
        const formData = constructPayload(form);
        formData.payload.turnstileToken = token; // includes the turnstile token in the payload of the form

        const submission = await submitForm(form);
        button.removeAttribute('disabled');
        
        if (!submission) return;
        clearForm(form);
        
        // Hide/remove the Turnstile widget after successful submission
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

function createInput({ type, field, placeholder, required, defval }) {
  const input = createTag('input', { type, id: field, placeholder, value: defval && defval !== 'undefined' ? defval : '' });
  if (required === 'x') input.setAttribute('required', 'required');
  return input;
}

function createFileInput({ field, required, placeholder }) {
  const wrapper = createTag('div', { class: 'file-upload-wrapper' });
  const input = createTag('input', { type: 'file', id: field, multiple: true, accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif' });
  if (required === 'x') input.setAttribute('required', 'required');
  
  const dropZone = createTag('div', { class: 'file-drop-zone' });
  const attachButton = createTag('button', { type: 'button', class: 'attach-file-btn' }, 'Attach file');
  const dropText = createTag('span', { class: 'drop-text' }, 'Drop files here');
  
  dropZone.append(attachButton, dropText);
  
  // displays the files which are attached to the form
  const fileList = createTag('div', { class: 'file-list' });
  
  attachButton.addEventListener('click', () => input.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    input.files = e.dataTransfer.files;
    updateFileList();
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
  
  input.addEventListener('change', updateFileList);
  
  wrapper.append(input, dropZone, fileList);
  return wrapper;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// the steps arent properly implemented yet, due to there only being the one single page on the form page

function createStepIndicator(totalSteps, currentStep) {
  const wrapper = createTag('div', { class: 'step-indicator' });
  const progressLine = createTag('div', { class: 'progress-line' });
  const progressFill = createTag('div', { class: 'progress-fill' });
  progressLine.append(progressFill);
  
  const stepsWrapper = createTag('div', { class: 'steps-wrapper' });
  
  for (let i = 1; i <= totalSteps; i++) {
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

function navigateStep(form, targetStep) {
  // hides the steps
  form.querySelectorAll('.form-step').forEach(step => {
    step.style.display = 'none';
  });
  
  // Show target step
  const targetStepElement = form.querySelector(`[data-step="${targetStep}"]`);
  if (targetStepElement) {
    targetStepElement.style.display = 'block';
  }
  
  // updates the step indicator as in showing the current step you are currently on and the progress bar
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
  
  // updates the navigation buttons
  const navigation = form.querySelector('.step-navigation');
  if (navigation) {
    navigation.replaceWith(createStepNavigation(targetStep, getTotalSteps(form), form));
  }
  
  // Store current step
  form.dataset.currentStep = targetStep;
}

function validateCurrentStep(form, step) {
  const stepElement = form.querySelector(`[data-step="${step}"]`);
  const requiredFields = stepElement.querySelectorAll('[required]');

  console.log('Validating step:', step);
  console.log('Step element:', stepElement);
  console.log('Required fields found:', requiredFields.length);
  
  let valid = true;
  requiredFields.forEach(field => {
    if (!field.checkValidity()) {
      field.reportValidity();
      valid = false;
    }
  });
  
  return valid;
}

function getTotalSteps(form) {
  return form.querySelectorAll('.form-step').length;
}

function saveFormDataToSession(form) {
  const formData = constructPayload(form);
  sessionStorage.setItem(`formData_${form.dataset.action}`, JSON.stringify(formData));
}

function loadFormDataFromSession(form) {
  const savedData = sessionStorage.getItem(`formData_${form.dataset.action}`);
  if (savedData) {
    const data = JSON.parse(savedData);
    Object.keys(data).forEach(key => {
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
      acc['defval'] = obj[key];
    } else if (lowerKey === 'mandatory') {
      acc['required'] = obj[key];
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
      stepNumber = parseInt(fd.extra.match(/step-(\d+)/)[1]) || stepCounter;
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
    const stepNumber = parseInt(stepNum);
    const stepWrapper = createTag('div', { 
      class: 'form-step', 
      'data-step': stepNumber,
      style: stepNumber === 1 ? 'block' : 'none'
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