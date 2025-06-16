pipeline {
    agent any

    tools {
        // لازم يكون نفس الاسم اللي كتبته في Jenkins GUI
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        
        SONAR_CREDENTIALS  = credentials('sonar-token')
        AWS_CREDENTIALS_ID = 'aws-credentials'
    }

    stages {

        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh 'sonar-scanner'
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                echo "Building Backend image: ${imageName}"
                                def backendImage = docker.build(imageName, '.')

                                echo "Scanning Backend image with Trivy for vulnerabilities..."
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Backend image to ECR..."
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                echo "Building Frontend image: ${imageName}"
                                def frontendImage = docker.build(imageName, '.')

                                echo "Scanning Frontend image with Trivy for vulnerabilities..."
                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Frontend image to ECR..."
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                script {
                    withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                        echo "Configuring kubectl for EKS cluster: ${EKS_CLUSTER_NAME}"
                        sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${env.AWS_REGION} --alias ${EKS_CLUSTER_NAME}"

                        echo "Deploying application with Helm..."
                        sh """
                            helm upgrade --install my-app ./helm/my-app \
                                --namespace default \
                                --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set backend.image.tag=3tier-nodejs-backend-${env.BUILD_ID} \
                                --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set frontend.image.tag=3tier-nodejs-frontend-${env.BUILD_ID}
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Pipeline finished. Cleaning up workspace."
                cleanWs()
            }
        }
        success {
            echo "✅ Build and deploy successful!"
        }
        failure {
            echo "❌ Build failed."
        }
    }
}
