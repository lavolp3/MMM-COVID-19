Module.register("MMM-COVID-19",{
  defaults: {
    scanInterval: 1000 * 60 * 60 * 12,
    logProvinceCountry: false,
    logOnce: true,
    rotateInterval: 1000 * 5,
    detailProvince: false,
    pinned: ["Others", "Diamond Princess cruise ship"],
    sortOrder: null,
    dailyGraph: true
  },

  getStyles: function() {
    return ["MMM-COVID-19.css"]
  },
  
  getScripts: function() {
    return [this.file('node_modules/chart.js/dist/Chart.bundle.js')]
  },

  start: function() {
    this.alreadyLogged = false
    this.scanTimer = null
    this.drawTimer = null
    this.regionIndex = 0
    this.rawData = null
    this.store = {}
    this.sortOrder = (a, b)=> {
      if (b.countryregion !== a.countryregion) return (a.countryregion < b.countryregion) ? -1 : 1
      if (b.provincestate !== a.provincestate) return (a.provincestate < b.provincestate) ? -1 : 1
      if (b.confirmed !== a.confirmed) return b.confirmed - a.confirmed
      if (b.deaths !== a.deaths) return b.deaths - a.deaths
      return b.recover - a.recover
    }
    if (typeof this.config.sortOrder == "function") this.sortOrder = this.config.sortOrder
    this.scanPolling()
  },

  getDom: function() {
    var dom = document.createElement("div")
    dom.classList.add("covid")
    if (Array.isArray(this.rawData)) {
      this.drawTotal(dom)
      this.drawPinned(dom)
      this.drawEach(dom)
    }
	if (this.config.dailyGraph) { this.drawChart(dom) }
    return dom
  },

  itemDom: function(parent, o, className="") {
    var dom = document.createElement("div")
    dom.classList.add("item")
    dom.classList.add(className)
    var region = document.createElement("div")
    region.classList.add("location")
    region.innerHTML = o.region
    dom.appendChild(region)
    var numbers = document.createElement("div")
    numbers.classList.add("numbers")
    var confirmed = document.createElement("div")
    confirmed.classList.add("confirmed", "number")
    confirmed.innerHTML = o.confirmed
    numbers.appendChild(confirmed)
    var deaths = document.createElement("div")
    deaths.classList.add("deaths", "number")
    deaths.innerHTML = o.deaths
    numbers.appendChild(deaths)
    var recovered = document.createElement("div")
    recovered.classList.add("recovered", "number")
    recovered.innerHTML = o.recovered
    numbers.appendChild(recovered)
    dom.appendChild(numbers)
    parent.appendChild(dom)
  },

  drawTotal: function(parent) {
    var total = {
      region: "Total",
      confirmed:0,
      deaths:0,
      recovered:0,
    }
    if (this.store && this.store.hasOwnProperty("total")) {
      total = this.store.total
    } else {
      for (var r of this.rawData) {
        total.confirmed += r.confirmed
        total.deaths += r.deaths
        total.recovered += r.recovered
      }
    }
    this.store.total = total
    this.itemDom(parent, total, "total")
  },

  drawRegion: function(parent, region, className = "") {
    if (!Array.isArray(region) || region.length < 1) return
    var country = region[0]
    var province = (region[1]) ? region[1] : null
    var total = {
      region: ((province) ? `${province}, ${country}` : country),
      confirmed:0,
      deaths:0,
      recovered:0,
    }
    var regionKey = country + ":" + ((province) ? province : "")
    if (this.store && this.store.hasOwnProperty(regionKey)) {
      total = this.store[regionKey]
    } else {
      var result = this.rawData.filter((r)=>{
        if (r.countryregion == country) {
          if (!province || r.provincestate == province) {
            return true
          }
        }
        return false
      })
      if (Array.isArray(result)) {
        for (var r of result) {
          total.confirmed += r.confirmed
          total.deaths += r.deaths
          total.recovered += r.recovered
        }
      }
    }
    this.store[regionKey] = total
    this.itemDom(parent, total, className)
  },

  drawPinned: function(parent) {
    this.drawRegion(parent, this.config.pinned, "pinned")
  },

  drawEach: function(parent) {
    var t = []
    if (this.config.detailProvince) {
      t = this.indexPool[this.regionIndex]
    } else {
      t.push(this.indexPool[this.regionIndex])
    }
    if (this.regionIndex >= this.indexPool.length - 1) {
      this.regionIndex = 0
    } else {
      this.regionIndex++
    }
    this.drawRegion(parent, t, "rotate")
  },


  drawChart: function(parent) {
    var canvas = document.createElement("canvas")
    canvas.id = "chart";
	parent.appendChild(canvas);
  },
  

  notificationReceived: function(noti, payload, sender) {

  },

  drawPolling: function() {
    clearTimeout(this.drawTimer)
    this.updateDom()
    this.drawTimer = setTimeout(()=>{
      this.drawPolling()
    }, this.config.rotateInterval)
  },

  scanPolling: function() {
    clearTimeout(this.scanTimer)
    this.scan("latest");
    if (this.config.dailyGraph) {
      this.scan("timeseries")
    }
    this.scanTimer = setTimeout(()=>{
      this.scanPolling()
    }, this.config.scanInterval)
  },

  scan: function(method) {
	var self = this;
    var xhttp = new XMLHttpRequest();
    xhttp.open("GET", "https://wuhan-coronavirus-api.laeyoung.endpoint.ainize.ai/jhu-edu/" + method, true)
    xhttp.onreadystatechange = () => {
      if (xhttp.readyState == 4 && xhttp.status == 200) {
        this.parse(xhttp.responseText, method);
      }
    }
    xhttp.send()
  },

  parse: function(response, method) {
    var data = null
    try {
      data = JSON.parse(response)
    } catch (e) {
      console.log("[COVID] ERROR: Fail to convert data")
      return
    }
    if (!Array.isArray(data)) {
      console.log("[COVID] ERROR: Invalid data format")
      return
    }
    if (method === "latest") {
      data = data.sort(this.sortOrder)
      var indexPool = []
      if (this.config.detailProvince) {
        indexPool = data.map((r)=>{
          return [r.countryregion, r.provincestate]
        })
      } else {
        indexPool = Array.from(new Set(data.map((r)=>{
          return r.countryregion
        })))
      }
      this.indexPool = indexPool
      console.log(this.indexPool)
      this.rawData = data
        this.store = {}
      if (this.config.logProvinceCountry && !this.alreadyLogged) {
        if (this.config.logOnce) this.alreadyLogged = true
        this.sendSocketNotification("LOG_PRSTCORE", data)
      }
	  this.drawPolling();
    } else if (method === "timeseries") {
      //console.log(data);
      var startDate = moment("2020-01-22");
      var days = moment().diff(startDate, "days")+1;
      //console.log(days, data.length);
      var seriesData = {};
      for (var d = 0; d < days; d++) {
        seriesData[startDate.clone().add(d, "days").format("M/D/YY")] = {
          confirmed: 0,
          recovered: 0,
          deaths: 0,
        }
      }
      for (var p = 0; p < data.length; p++) {
        for (var d in data[p].timeseries) {
          for (var c in data[p].timeseries[d]) {
            seriesData[d][c] += data[p].timeseries[d][c]
          }
        }
      }
      var chartData = [[],[],[]];
	  var times = [];
      for (day in seriesData) {
        var lastDay = moment(day, "M/D/YY").clone().subtract(1, "days").format("M/D/YY");
		times.push(moment(day, "M/D/YY").format("X"));
        chartData[0].push(Math.max((seriesData.hasOwnProperty(lastDay)) ? seriesData[day].confirmed - seriesData[lastDay].confirmed : 0, 0));
        chartData[1].push(Math.max((seriesData.hasOwnProperty(lastDay)) ? seriesData[day].deaths - seriesData[lastDay].deaths : 0, 0));
		chartData[2].push(Math.max((seriesData.hasOwnProperty(lastDay)) ? seriesData[day].recovered - seriesData[lastDay].recovered : 0, 0));
      }
      console.log(times);
	  console.log(chartData);
	  this.drawPolling();
      this.fillChart(chartData, times);
	}
  },
  
  fillChart: function(chartData, times) {
    var chart = document.getElementById("chart");
    chart.style.display = "block";
    chart.width = 400;
    chart.height = 300;
    var ctx = chart.getContext("2d");
    Chart.defaults.global.defaultFontSize = 14;
    var coronaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: times,
        datasets: [
          {
            label: "confirmed",
            data: chartData[0],
            barPercentage: 1,
            categoryPercentage: 0.8,  
            backgroundColor: 'white',
            borderWidth: 1,
            pointRadius: 0,
            fill: 'origin'
          },
          {
            label: "deaths",
            data: chartData[1],
            barPercentage: 1,
            categoryPercentage: 0.8,  
            backgroundColor: 'red',
            borderWidth: 1,
            pointRadius: 0,
            fill: 'origin'
          },
          {
            label: "recovered",
            data: chartData[2],
            barPercentage: 1,
            categoryPercentage: 0.8,  
            backgroundColor: 'green',
            borderWidth: 1,
            pointRadius: 0,
            fill: 'origin'
          }
        ],
      },
      options: {
        responsive: false,
        maintainAspectRatio: true,
        animation: {
          duration: 0,
        },
        scales: {
          yAxes: [{
            display: true,
            ticks: {
              suggestedMax: 0.6,
              display: false,
            }
          }],
          xAxes: [{
            //type: "time",
            /*time: {
              unit: 'day',
              //parser: "HH:mm",
              displayFormats: {
                day: 'MM/DD'
              },
            },*/
            ticks: {
              fontColor: '#eee',
              fontSize: 20,
            }
          }]
        },
        legend: { display: false, },
        borderColor: 'white',
        borderWidth: 1,
      }
    });
  }
})
